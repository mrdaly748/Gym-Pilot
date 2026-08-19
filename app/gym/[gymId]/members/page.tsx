import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import { archiveMemberAction, createMemberAction, reactivateMemberAction } from "./actions";

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
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId } = await params;
  const { error } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const members = await listMembers({ userId: session.userId, gymId, role: session.role });

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Members</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Register a member</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={createMemberAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Full name
            <input
              type="text"
              name="name"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Phone
            <input
              type="tel"
              name="phone"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Join date
            <input
              type="date"
              name="joinDate"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Emergency contact name (optional)
            <input
              type="text"
              name="emergencyContactName"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Emergency contact phone (optional)
            <input
              type="tel"
              name="emergencyContactPhone"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Register member
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All members</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Join date</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <Link
                    href={`/gym/${gymId}/members/${member.id}/edit`}
                    className="underline"
                  >
                    {member.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{member.phone}</td>
                <td className="py-2 pr-4">{formatDate(member.joinDate)}</td>
                <td className="py-2 pr-4">
                  {member.archivedAt ? "Archived" : "Active"}
                </td>
                <td className="py-2">
                  {member.archivedAt ? (
                    <form action={reactivateMemberAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <button type="submit" className="text-sm underline">
                        Reactivate
                      </button>
                    </form>
                  ) : (
                    <form action={archiveMemberAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <button type="submit" className="text-sm underline">
                        Archive
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
