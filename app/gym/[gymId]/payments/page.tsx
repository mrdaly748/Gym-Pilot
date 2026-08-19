import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listMemberships } from "@/lib/server/services/memberships";
import { gymOutstandingBalance, listPayments } from "@/lib/server/services/payments";
import { adjustPaymentAction, recordPaymentAction, voidPaymentAction } from "./actions";

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Gym Admin AND Gym Staff can record payments and see individual payment
 * records (product-spec.md §11.4, and the core "collect an outstanding
 * balance" flow needs Staff to see it) — no extra role check beyond what
 * app/gym/[gymId]/layout.tsx already requires. Adjusting/voiding is the one
 * Admin-only action here, gated inline below. This page intentionally does
 * NOT show the gym-wide outstanding-balance total to Gym Staff — that
 * aggregate figure is the kind of "sensitive financial analytics" spec
 * §11.8 reserves for Gym Admin; per-payment records remain visible to both
 * roles since Staff needs them operationally.
 */
export default async function PaymentsPage({
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
  const [payments, memberships] = await Promise.all([
    listPayments(context),
    listMemberships(context),
  ]);
  const outstandingBalance =
    session.role === "GYM_ADMIN" ? await gymOutstandingBalance(context) : null;

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Payments</h1>
      {outstandingBalance !== null && (
        <p className="mt-1 text-sm text-gray-600">
          Gym-wide outstanding balance: {formatMillimes(outstandingBalance)}
        </p>
      )}

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Record a payment</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={recordPaymentAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Membership
            <select
              name="membershipId"
              required
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Select a membership</option>
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.memberName} — {m.planNameSnapshot}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Amount (TND)
            <input
              type="number"
              name="amount"
              step="0.001"
              min="0.001"
              required
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Method
            <input
              type="text"
              name="method"
              required
              defaultValue="cash"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Record payment
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All payments</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Effective</th>
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Recorded by</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{formatDate(p.paidAt)}</td>
                <td className="py-2 pr-4">{formatMillimes(p.amountMillimes)}</td>
                <td className="py-2 pr-4">
                  {formatMillimes(p.effectiveAmountMillimes)}
                  {p.adjustments.length > 0 && (
                    <span className="ml-1 text-xs text-gray-500">
                      ({p.adjustments.length} adjustment
                      {p.adjustments.length > 1 ? "s" : ""})
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{p.method}</td>
                <td className="py-2 pr-4">{p.recordedByEmail}</td>
                <td className="py-2">
                  {session.role === "GYM_ADMIN" && p.effectiveAmountMillimes > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <form action={voidPaymentAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input
                          type="hidden"
                          name="effectiveAmountMillimes"
                          value={p.effectiveAmountMillimes}
                        />
                        <button type="submit" className="text-sm underline">
                          Void
                        </button>
                      </form>
                      <details>
                        <summary className="cursor-pointer text-sm underline">
                          Adjust
                        </summary>
                        <form
                          action={adjustPaymentAction}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input
                            type="number"
                            name="amount"
                            step="0.001"
                            required
                            placeholder="e.g. -10.000"
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Reason (optional)"
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <button
                            type="submit"
                            className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
                          >
                            Submit adjustment
                          </button>
                        </form>
                      </details>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
