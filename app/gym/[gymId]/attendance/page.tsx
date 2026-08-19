import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listMembers } from "@/lib/server/services/members";
import {
  gymAttendanceMetrics,
  listCheckins,
} from "@/lib/server/services/attendance";
import { checkInAction, correctCheckinAction, deleteCheckinAction } from "./actions";

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString();
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Gym Admin AND Gym Staff can check members in and view attendance history
 * and metrics (product-spec.md §11.5, §5.3) — attendance is not among the
 * figures §11.8 restricts to Gym Admin (that list is revenue/expenses/
 * outstanding-payment totals only), so unlike the Payments page there is no
 * role-conditional hiding of the period totals here. Correcting/deleting an
 * existing check-in is Gym-Admin-only, gated inline below.
 */
export default async function AttendancePage({
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
  const now = new Date();
  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);

  const [members, checkins, metrics] = await Promise.all([
    listMembers(context),
    listCheckins(context),
    gymAttendanceMetrics(context, periodStart, periodEnd),
  ]);

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Attendance</h1>
      <p className="mt-1 text-sm text-gray-600">
        This month: {metrics.totalCheckins} check-ins, {metrics.uniqueVisitors} unique visitors.
      </p>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Check a member in</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={checkInAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Member
            <select
              name="memberId"
              required
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Select a member</option>
              {members
                .filter((m) => !m.archivedAt)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Check in
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Recent check-ins</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Member</th>
              <th className="py-2 pr-4">Membership status</th>
              <th className="py-2 pr-4">Checked in</th>
              <th className="py-2 pr-4">Recorded by</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {checkins.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{c.memberName}</td>
                <td className="py-2 pr-4">{c.membershipStatus ?? "No membership"}</td>
                <td className="py-2 pr-4">{formatDateTime(c.checkedInAt)}</td>
                <td className="py-2 pr-4">{c.recordedByEmail}</td>
                <td className="py-2">
                  {session.role === "GYM_ADMIN" && (
                    <div className="flex flex-wrap gap-2">
                      <form action={deleteCheckinAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="checkinId" value={c.id} />
                        <button type="submit" className="text-sm underline">
                          Delete
                        </button>
                      </form>
                      <details>
                        <summary className="cursor-pointer text-sm underline">
                          Correct member
                        </summary>
                        <form
                          action={correctCheckinAction}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="checkinId" value={c.id} />
                          <select
                            name="memberId"
                            required
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          >
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
                          >
                            Save correction
                          </button>
                        </form>
                      </details>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {checkins.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-gray-500">
                  No check-ins yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
