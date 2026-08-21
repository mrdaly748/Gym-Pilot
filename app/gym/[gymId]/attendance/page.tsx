import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import { gymAttendanceMetrics, listCheckinsPage } from "@/lib/server/services/attendance";
import { checkInAction, correctCheckinAction, deleteCheckinAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";
import { Pagination } from "@/components/ui/Pagination";
import { AttendanceIcon, MembersIcon } from "@/components/ui/icons";

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString();
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

const STATUS_BADGE: Record<string, BadgeStatus> = {
  ACTIVE: "active",
  EXPIRING_SOON: "expiring-soon",
  EXPIRED: "expired",
  FROZEN: "frozen",
  CANCELLED: "cancelled",
};

/**
 * Gym Admin AND Gym Staff can check members in and view attendance history
 * and metrics (product-spec.md §11.5, §5.3) — attendance is not among the
 * figures §11.8 restricts to Gym Admin, so unlike Payments there is no
 * role-conditional hiding of the period totals here. Correcting/deleting an
 * existing check-in is Gym-Admin-only, gated inline below.
 */
export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ error?: string; success?: string; page?: string }>;
}) {
  const { gymId } = await params;
  const { error, success, page: rawPage } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const parsedPage = Number(rawPage);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;

  const context = { userId: session.userId, gymId, role: session.role };
  const now = new Date();
  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);

  const [members, checkinsPage, metrics] = await Promise.all([
    listMembers(context),
    listCheckinsPage(context, { page }),
    gymAttendanceMetrics(context, periodStart, periodEnd),
  ]);
  const checkins = checkinsPage.items;

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Attendance" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          label="Check-ins this month"
          value={String(metrics.totalCheckins)}
          icon={<AttendanceIcon className="h-4.5 w-4.5" />}
          tone="accent"
        />
        <StatCard
          label="Unique visitors"
          value={String(metrics.uniqueVisitors)}
          icon={<MembersIcon className="h-4.5 w-4.5" />}
        />
      </div>

      <div className="mt-8">
        <FormSection title="Check a member in" error={error}>
          <form action={checkInAction} className="flex flex-col gap-3">
            <input type="hidden" name="gymId" value={gymId} />
            <Select label="Member" name="memberId" required defaultValue="">
              <option value="" disabled>
                Select a member
              </option>
              {members
                .filter((m) => !m.archivedAt)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </Select>
            <Button type="submit" variant="primary">
              Check in
            </Button>
          </form>
        </FormSection>
      </div>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Recent check-ins
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Member</Th>
                <Th>Membership status</Th>
                <Th>Checked in</Th>
                <Th>Recorded by</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {checkins.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.memberName}</Td>
                  <Td>
                    {c.membershipStatus ? (
                      <Badge status={STATUS_BADGE[c.membershipStatus] ?? "active"} />
                    ) : (
                      <span className="text-text-tertiary">No membership</span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{formatDateTime(c.checkedInAt)}</Td>
                  <Td className="text-text-secondary">{c.recordedByEmail}</Td>
                  <Td>
                    {session.role === "GYM_ADMIN" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={deleteCheckinAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="checkinId" value={c.id} />
                          <ConfirmSubmitButton
                            confirmTitle="Delete this check-in?"
                            confirmMessage="This removes the attendance record permanently. It does not affect the member's membership status."
                            confirmLabel="Delete"
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                        <details>
                          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-3 hover:text-foreground">
                            Correct member
                          </summary>
                          <form
                            action={correctCheckinAction}
                            className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-1 p-3"
                          >
                            <input type="hidden" name="gymId" value={gymId} />
                            <input type="hidden" name="checkinId" value={c.id} />
                            <Select label="Member" name="memberId" required defaultValue="">
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" variant="primary" className="self-start">
                              Save correction
                            </Button>
                          </form>
                        </details>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
              {checkins.length === 0 && (
                <EmptyRow colSpan={5}>
                  {checkinsPage.totalCount === 0 ? "No check-ins yet." : "No check-ins on this page."}
                </EmptyRow>
              )}
            </tbody>
          </Table>
          <Pagination
            page={checkinsPage.page}
            totalPages={checkinsPage.totalPages}
            basePath={`/gym/${gymId}/attendance`}
          />
        </div>
      </section>
    </main>
  );
}
