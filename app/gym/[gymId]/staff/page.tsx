import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listGymStaff } from "@/lib/server/services/gymStaff";
import {
  createGymStaffAction,
  disableGymStaffAction,
  enableGymStaffAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

/**
 * app/gym/[gymId]/layout.tsx allows both GYM_ADMIN and GYM_STAFF into the
 * whole /gym/[gymId]/* area, but staff management is Gym Admin only
 * (docs/architecture.md §2's file-tree comment) — so this page needs its
 * own role check on top of the layout's, unlike app/gym/[gymId]/page.tsx.
 */
export default async function GymStaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId } = await params;
  const { error, success } = await searchParams;

  let session;
  try {
    session = await requireGym(gymId);
    await requireRole("GYM_ADMIN");
  } catch {
    redirect(`/gym/${gymId}`);
  }

  const staff = await listGymStaff({
    userId: session.userId,
    gymId,
    role: session.role,
  });

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Gym Staff" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Add staff" error={error}>
        <form action={createGymStaffAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <TextInput label="Staff email" type="email" name="email" required />
          <Button type="submit" variant="primary">
            Invite staff
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Staff logins
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {staff.map((member) => (
                <Tr key={member.id}>
                  <Td className="font-medium">{member.email}</Td>
                  <Td>
                    <Badge status={member.disabledAt ? "disabled" : "active"} />
                  </Td>
                  <Td>
                    {member.disabledAt ? (
                      <form action={enableGymStaffAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={member.id} />
                        <Button type="submit" variant="ghost">
                          Enable
                        </Button>
                      </form>
                    ) : (
                      <form action={disableGymStaffAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={member.id} />
                        <ConfirmSubmitButton
                          confirmTitle="Disable this staff login?"
                          confirmMessage={`${member.email} will immediately lose access. You can re-enable it later.`}
                          confirmLabel="Disable"
                        >
                          Disable
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
              {staff.length === 0 && <EmptyRow colSpan={3}>No staff yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
