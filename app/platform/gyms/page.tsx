import Link from "next/link";
import { listGyms } from "@/lib/server/services/platformAdmin";
import {
  createGymAction,
  reactivateGymAction,
  suspendGymAction,
} from "./actions";

/**
 * Role/authentication is already guarded by app/platform/layout.tsx
 * (requireRole("PLATFORM_ADMIN")) — matching the Phase 1 convention of not
 * re-checking at the page level. The Server Actions this page's forms
 * submit to are guarded independently (they're reachable outside this
 * page's render tree), see ./actions.ts.
 */
export default async function PlatformGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const gyms = await listGyms();

  return (
    <main className="p-8">
      <Link href="/platform" className="text-sm underline">
        &larr; Platform Admin
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Gyms</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Create a gym</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={createGymAction} className="mt-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Gym name
            <input
              type="text"
              name="name"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Initial Gym Admin email
            <input
              type="email"
              name="adminEmail"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Create gym &amp; invite admin
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All gyms</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {gyms.map((gym) => (
              <tr key={gym.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{gym.name}</td>
                <td className="py-2 pr-4">{gym.status}</td>
                <td className="py-2 pr-4">
                  {gym.createdAt.toLocaleDateString()}
                </td>
                <td className="py-2">
                  {gym.status === "ACTIVE" ? (
                    <form action={suspendGymAction}>
                      <input type="hidden" name="gymId" value={gym.id} />
                      <button type="submit" className="text-sm underline">
                        Suspend
                      </button>
                    </form>
                  ) : (
                    <form action={reactivateGymAction}>
                      <input type="hidden" name="gymId" value={gym.id} />
                      <button type="submit" className="text-sm underline">
                        Reactivate
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {gyms.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-gray-500">
                  No gyms yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
