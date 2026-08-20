import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import { listPlans } from "@/lib/server/services/plans";
import { listMemberships } from "@/lib/server/services/memberships";
import {
  assignMembershipAction,
  cancelMembershipAction,
  freezeMembershipAction,
  renewMembershipAction,
  resumeMembershipAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function formatPrice(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

const STATUS_BADGE: Record<string, BadgeStatus> = {
  ACTIVE: "active",
  EXPIRING_SOON: "expiring-soon",
  EXPIRED: "expired",
  FROZEN: "frozen",
  CANCELLED: "cancelled",
};

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.3) — no extra role check
 * beyond what app/gym/[gymId]/layout.tsx already requires. Cancellation is
 * the one Admin-only, genuinely irreversible action here, so it's the only
 * one gated behind a confirmation dialog — Renew/Freeze/Resume stay plain,
 * single-click actions since they're routine and reversible.
 */
export default async function MembershipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId } = await params;
  const { error, success } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const context = { userId: session.userId, gymId, role: session.role };
  const [memberships, members, plans] = await Promise.all([
    listMemberships(context),
    listMembers(context),
    listPlans(context),
  ]);

  const activeMembers = members.filter((m) => !m.archivedAt);
  const activePlans = plans.filter((p) => !p.archivedAt);

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Memberships" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Assign a membership" error={error}>
        <form action={assignMembershipAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <Select label="Member" name="memberId" required defaultValue="">
            <option value="" disabled>
              Select a member
            </option>
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select label="Plan" name="planId" required defaultValue="">
            <option value="" disabled>
              Select a plan
            </option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatPrice(p.priceMillimes)} / {p.durationDays}d
              </option>
            ))}
          </Select>
          <Button type="submit" variant="primary">
            Assign membership
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All memberships
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Member</Th>
                <Th>Plan</Th>
                <Th>Start</Th>
                <Th>End</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </Thead>
            <tbody>
              {memberships.map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium">{m.memberName}</Td>
                  <Td className="text-text-secondary">{m.planNameSnapshot}</Td>
                  <Td className="text-text-secondary">{formatDate(m.startDate)}</Td>
                  <Td className="text-text-secondary">{formatDate(m.endDate)}</Td>
                  <Td>
                    <Badge status={STATUS_BADGE[m.status] ?? "active"} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {(m.status === "ACTIVE" ||
                        m.status === "EXPIRING_SOON" ||
                        m.status === "EXPIRED") && (
                        <form action={renewMembershipAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="membershipId" value={m.id} />
                          <Button type="submit" variant="ghost">
                            Renew
                          </Button>
                        </form>
                      )}
                      {(m.status === "ACTIVE" || m.status === "EXPIRING_SOON") && (
                        <form action={freezeMembershipAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="membershipId" value={m.id} />
                          <Button type="submit" variant="ghost">
                            Freeze
                          </Button>
                        </form>
                      )}
                      {m.status === "FROZEN" && (
                        <form action={resumeMembershipAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="membershipId" value={m.id} />
                          <Button type="submit" variant="ghost">
                            Resume
                          </Button>
                        </form>
                      )}
                      {session.role === "GYM_ADMIN" && m.status !== "CANCELLED" && (
                        <form action={cancelMembershipAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="membershipId" value={m.id} />
                          <ConfirmSubmitButton
                            confirmTitle="Cancel this membership?"
                            confirmMessage={`${m.memberName}'s membership will be cancelled before its natural expiry. This is a permanent historical record and cannot be undone.`}
                            confirmLabel="Cancel membership"
                          >
                            Cancel
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
              {memberships.length === 0 && <EmptyRow colSpan={6}>No memberships yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
