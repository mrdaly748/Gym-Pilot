import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listPlans } from "@/lib/server/services/plans";
import { archivePlanAction, createPlanAction } from "./actions";

function formatPrice(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

/**
 * Gym Admin only (product-spec.md §11.2) — the shared gym layout allows
 * both roles in, so this page needs its own role check on top of the
 * layout's, same as app/gym/[gymId]/staff/page.tsx.
 */
export default async function MembershipPlansPage({
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

  const plans = await listPlans({ userId: session.userId, gymId, role: session.role });

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Membership Plans</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Create a plan</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={createPlanAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Plan name
            <input
              type="text"
              name="name"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Price (TND, 0 for a free trial)
            <input
              type="number"
              name="price"
              step="0.001"
              min="0"
              required
              defaultValue="0"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Duration (days)
            <input
              type="number"
              name="durationDays"
              step="1"
              min="1"
              required
              defaultValue="30"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Create plan
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All plans</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Price</th>
              <th className="py-2 pr-4">Duration</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{plan.name}</td>
                <td className="py-2 pr-4">{formatPrice(plan.priceMillimes)}</td>
                <td className="py-2 pr-4">{plan.durationDays} days</td>
                <td className="py-2 pr-4">
                  {plan.archivedAt ? "Archived" : "Active"}
                </td>
                <td className="py-2">
                  {!plan.archivedAt && (
                    <form action={archivePlanAction}>
                      <input type="hidden" name="gymId" value={gymId} />
                      <input type="hidden" name="planId" value={plan.id} />
                      <button type="submit" className="text-sm underline">
                        Archive
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  No plans yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
