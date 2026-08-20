import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import { listMembersForTrainer, listTrainers } from "@/lib/server/services/trainers";
import {
  archiveTrainerAction,
  assignTrainerAction,
  createTrainerAction,
  reactivateTrainerAction,
  unassignTrainerAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

/**
 * Gym-Admin-only (product-spec.md §11.6) — app/gym/[gymId]/layout.tsx only
 * guarantees an authenticated gym session, not a specific role, so this
 * page enforces Admin-only itself, same as app/gym/[gymId]/staff/. Gym
 * Staff has zero access to trainer data at the service layer and RLS —
 * hitting this route directly as Staff fails the requireRole() check below
 * before any trainer data is ever read.
 */
export default async function TrainersPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId } = await params;
  const { error, success } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const context = { userId: session.userId, gymId, role: session.role };
  const [trainers, members] = await Promise.all([
    listTrainers(context, { includeArchived: true }),
    listMembers(context),
  ]);
  const activeMembers = members.filter((m) => !m.archivedAt);

  const trainerMembers = await Promise.all(
    trainers.map((t) => listMembersForTrainer(context, t.id)),
  );

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Trainers" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Add a trainer" error={error}>
        <form action={createTrainerAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <TextInput label="Name" type="text" name="name" required />
          <TextInput label="Contact phone (optional)" type="tel" name="contactPhone" />
          <TextInput label="Contact email (optional)" type="email" name="contactEmail" />
          <TextInput label="Specialty / notes (optional)" type="text" name="specialty" />
          <Button type="submit" variant="primary">
            Add trainer
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All trainers
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Assigned members</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {trainers.map((trainer, i) => (
                <Tr key={trainer.id}>
                  <Td>
                    <Link
                      href={`/gym/${gymId}/trainers/${trainer.id}/edit`}
                      className="font-medium text-foreground hover:text-accent"
                    >
                      {trainer.name}
                    </Link>
                  </Td>
                  <Td className="text-text-secondary">
                    {trainer.contactPhone ?? trainer.contactEmail ?? "—"}
                  </Td>
                  <Td>
                    <Badge status={trainer.archivedAt ? "archived" : "active"} />
                  </Td>
                  <Td>
                    <div className="flex max-w-xs flex-wrap gap-1.5">
                      {trainerMembers[i].map((m) => (
                        <span
                          key={m.memberId}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pr-1.5 pl-2.5 text-xs text-text-secondary"
                        >
                          {m.memberName}
                          <form action={unassignTrainerAction} className="inline">
                            <input type="hidden" name="gymId" value={gymId} />
                            <input type="hidden" name="trainerId" value={trainer.id} />
                            <input type="hidden" name="memberId" value={m.memberId} />
                            <button
                              type="submit"
                              aria-label={`Remove ${m.memberName}`}
                              className="rounded-full text-text-tertiary hover:text-danger"
                            >
                              ×
                            </button>
                          </form>
                        </span>
                      ))}
                    </div>
                    {!trainer.archivedAt && (
                      <details className="mt-2">
                        <summary className="cursor-pointer list-none text-xs text-accent hover:text-accent">
                          + Assign member
                        </summary>
                        <form
                          action={assignTrainerAction}
                          className="mt-2 flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="trainerId" value={trainer.id} />
                          <div className="w-48">
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
                          </div>
                          <Button type="submit" variant="secondary">
                            Assign
                          </Button>
                        </form>
                      </details>
                    )}
                  </Td>
                  <Td>
                    {trainer.archivedAt ? (
                      <form action={reactivateTrainerAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="trainerId" value={trainer.id} />
                        <Button type="submit" variant="ghost">
                          Reactivate
                        </Button>
                      </form>
                    ) : (
                      <form action={archiveTrainerAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="trainerId" value={trainer.id} />
                        <ConfirmSubmitButton
                          confirmTitle="Archive this trainer?"
                          confirmMessage={`${trainer.name} will no longer be assignable to members. Existing history is preserved and this can be undone.`}
                          confirmLabel="Archive"
                        >
                          Archive
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
              {trainers.length === 0 && <EmptyRow colSpan={5}>No trainers yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
