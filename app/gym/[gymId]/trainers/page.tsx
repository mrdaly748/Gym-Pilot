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
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId } = await params;
  const { error } = await searchParams;
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
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Trainers</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Add a trainer</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={createTrainerAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              type="text"
              name="name"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Contact phone (optional)
            <input
              type="tel"
              name="contactPhone"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Contact email (optional)
            <input
              type="email"
              name="contactEmail"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Specialty / notes (optional)
            <input
              type="text"
              name="specialty"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Add trainer
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All trainers</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Members</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {trainers.map((trainer, i) => (
              <tr key={trainer.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <Link
                    href={`/gym/${gymId}/trainers/${trainer.id}/edit`}
                    className="underline"
                  >
                    {trainer.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {trainer.contactPhone ?? trainer.contactEmail ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  {trainer.archivedAt ? "Archived" : "Active"}
                </td>
                <td className="py-2 pr-4">
                  <ul className="text-xs">
                    {trainerMembers[i].map((m) => (
                      <li key={m.memberId} className="flex items-center gap-2">
                        {m.memberName}
                        <form action={unassignTrainerAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="trainerId" value={trainer.id} />
                          <input type="hidden" name="memberId" value={m.memberId} />
                          <button type="submit" className="underline">
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                  {!trainer.archivedAt && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs underline">
                        Assign member
                      </summary>
                      <form action={assignTrainerAction} className="mt-1 flex gap-2">
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="trainerId" value={trainer.id} />
                        <select
                          name="memberId"
                          required
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          <option value="">Select a member</option>
                          {activeMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
                        >
                          Assign
                        </button>
                      </form>
                    </details>
                  )}
                </td>
                <td className="py-2">
                  {trainer.archivedAt ? (
                    <form action={reactivateTrainerAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input type="hidden" name="trainerId" value={trainer.id} />
                      <button type="submit" className="text-sm underline">
                        Reactivate
                      </button>
                    </form>
                  ) : (
                    <form action={archiveTrainerAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input type="hidden" name="trainerId" value={trainer.id} />
                      <button type="submit" className="text-sm underline">
                        Archive
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {trainers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  No trainers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
