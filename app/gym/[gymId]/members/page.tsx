import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import { archiveMemberAction, createMemberAction, reactivateMemberAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.1) — no extra role check
 * needed beyond what app/gym/[gymId]/layout.tsx already requires.
 */
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ error?: string; success?: string; q?: string }>;
}) {
  const { gymId } = await params;
  const { error, success, q } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const members = await listMembers({ userId: session.userId, gymId, role: session.role }, { q });

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Members" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Register a member">
        <form action={createMemberAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <TextInput label="Full name" type="text" name="name" required />
          <TextInput label="Phone" type="tel" name="phone" required />
          <TextInput
            label="Join date"
            type="date"
            name="joinDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <TextInput
            label="Emergency contact name (optional)"
            type="text"
            name="emergencyContactName"
          />
          <TextInput
            label="Emergency contact phone (optional)"
            type="tel"
            name="emergencyContactPhone"
          />
          <Button type="submit" variant="primary">
            Register member
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            All members
          </h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <TextInput
                label="Search"
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Name or phone"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {q && (
              <Link
                href={`/gym/${gymId}/members`}
                className="text-sm text-text-secondary hover:text-foreground"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
        <div className="mt-3">
          <Flash error={error} success={success} />
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Join date</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {members.map((member) => (
                <Tr key={member.id}>
                  <Td>
                    <Link
                      href={`/gym/${gymId}/members/${member.id}`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {member.name}
                    </Link>
                  </Td>
                  <Td className="text-text-secondary">{member.phone}</Td>
                  <Td className="text-text-secondary">{formatDate(member.joinDate)}</Td>
                  <Td>
                    <Badge status={member.archivedAt ? "archived" : "active"} />
                  </Td>
                  <Td>
                    {member.archivedAt ? (
                      <form action={reactivateMemberAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <Button type="submit" variant="ghost">
                          Reactivate
                        </Button>
                      </form>
                    ) : (
                      <form action={archiveMemberAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <ConfirmSubmitButton
                          confirmTitle="Archive this member?"
                          confirmMessage={`${member.name} will be hidden from active lists. Their history is preserved and this can be undone.`}
                          confirmLabel="Archive"
                        >
                          Archive
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
              {members.length === 0 && (
                <EmptyRow colSpan={5}>
                  {q ? `No members match "${q}".` : "No members yet."}
                </EmptyRow>
              )}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
