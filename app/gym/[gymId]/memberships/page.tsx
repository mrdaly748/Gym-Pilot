import Link from "next/link";
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

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

function formatPrice(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  EXPIRED: "Expired",
  FROZEN: "Frozen",
  CANCELLED: "Cancelled",
};

/**
 * Gym Admin AND Gym Staff (product-spec.md §11.3) — no extra role check
 * beyond what app/gym/[gymId]/layout.tsx already requires. Cancellation is
 * the one Admin-only action here, gated inline below.
 */
export default async function MembershipsPage({
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

  const context = { userId: session.userId, gymId, role: session.role };
  const [memberships, members, plans] = await Promise.all([
    listMemberships(context),
    listMembers(context),
    listPlans(context),
  ]);

  const activeMembers = members.filter((m) => !m.archivedAt);
  const activePlans = plans.filter((p) => !p.archivedAt);

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Memberships</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Assign a membership</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={assignMembershipAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Member
            <select
              name="memberId"
              required
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Select a member</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Plan
            <select
              name="planId"
              required
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Select a plan</option>
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPrice(p.priceMillimes)} / {p.durationDays}d
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Assign membership
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All memberships</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Member</th>
              <th className="py-2 pr-4">Plan</th>
              <th className="py-2 pr-4">Start</th>
              <th className="py-2 pr-4">End</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{m.memberName}</td>
                <td className="py-2 pr-4">{m.planNameSnapshot}</td>
                <td className="py-2 pr-4">{formatDate(m.startDate)}</td>
                <td className="py-2 pr-4">{formatDate(m.endDate)}</td>
                <td className="py-2 pr-4">{STATUS_LABEL[m.status]}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {(m.status === "ACTIVE" ||
                      m.status === "EXPIRING_SOON" ||
                      m.status === "EXPIRED") && (
                      <form action={renewMembershipAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button type="submit" className="text-sm underline">
                          Renew
                        </button>
                      </form>
                    )}
                    {(m.status === "ACTIVE" || m.status === "EXPIRING_SOON") && (
                      <form action={freezeMembershipAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button type="submit" className="text-sm underline">
                          Freeze
                        </button>
                      </form>
                    )}
                    {m.status === "FROZEN" && (
                      <form action={resumeMembershipAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button type="submit" className="text-sm underline">
                          Resume
                        </button>
                      </form>
                    )}
                    {session.role === "GYM_ADMIN" && m.status !== "CANCELLED" && (
                      <form action={cancelMembershipAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button type="submit" className="text-sm underline">
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {memberships.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  No memberships yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
