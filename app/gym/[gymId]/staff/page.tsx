import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listGymStaff } from "@/lib/server/services/gymStaff";
import {
  createGymStaffAction,
  disableGymStaffAction,
  enableGymStaffAction,
} from "./actions";

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
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId } = await params;
  const { error } = await searchParams;

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
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Gym Staff</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Add staff</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form
          action={createGymStaffAction}
          className="mt-2 flex flex-col gap-3"
        >
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Staff email
            <input
              type="email"
              name="email"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Invite staff
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Staff logins</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{member.email}</td>
                <td className="py-2 pr-4">
                  {member.disabledAt ? "Disabled" : "Active"}
                </td>
                <td className="py-2">
                  {member.disabledAt ? (
                    <form action={enableGymStaffAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={member.id}
                      />
                      <button type="submit" className="text-sm underline">
                        Enable
                      </button>
                    </form>
                  ) : (
                    <form action={disableGymStaffAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input
                        type="hidden"
                        name="membershipId"
                        value={member.id}
                      />
                      <button type="submit" className="text-sm underline">
                        Disable
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-gray-500">
                  No staff yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
