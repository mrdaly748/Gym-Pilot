import Link from "next/link";
import { requireGym, requireRole } from "@/lib/server/auth";
import { EXPENSE_CATEGORIES, listExpenses } from "@/lib/server/services/expenses";
import { adjustExpenseAction, recordExpenseAction, voidExpenseAction } from "./actions";

function formatMillimes(millimes: number): string {
  return (millimes / 1000).toFixed(3) + " TND";
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString();
}

/**
 * Gym-Admin-only (product-spec.md §11.7: "Gym Staff do not record or view
 * expenses"). app/gym/[gymId]/layout.tsx only guarantees an authenticated
 * gym session, not a specific role, so this page enforces Admin-only
 * itself. Unlike Payments (both roles can read/record), Expense is fully
 * closed to Gym Staff at the service layer and RLS — there is no
 * role-conditional rendering here because Staff never reaches this page.
 */
export default async function ExpensesPage({
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
  const expenses = await listExpenses(context);

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Expenses</h1>

      <section className="mt-6 max-w-sm">
        <h2 className="text-sm font-medium">Record an expense</h2>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <form action={recordExpenseAction} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <label className="flex flex-col gap-1 text-sm">
            Category
            <select
              name="category"
              required
              className="rounded border border-gray-300 px-3 py-2"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
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
            Date
            <input
              type="date"
              name="expenseDate"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Note (optional)
            <input
              type="text"
              name="note"
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-gray-900 px-3 py-2 text-white"
          >
            Record expense
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">All expenses</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Effective</th>
              <th className="py-2 pr-4">Recorded by</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">{formatDate(e.expenseDate)}</td>
                <td className="py-2 pr-4">{e.category}</td>
                <td className="py-2 pr-4">{formatMillimes(e.amountMillimes)}</td>
                <td className="py-2 pr-4">
                  {formatMillimes(e.effectiveAmountMillimes)}
                  {e.adjustments.length > 0 && (
                    <span className="ml-1 text-xs text-gray-500">
                      ({e.adjustments.length} adjustment
                      {e.adjustments.length > 1 ? "s" : ""})
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">{e.recordedByEmail}</td>
                <td className="py-2">
                  {e.effectiveAmountMillimes > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <form action={voidExpenseAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="expenseId" value={e.id} />
                        <input
                          type="hidden"
                          name="effectiveAmountMillimes"
                          value={e.effectiveAmountMillimes}
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
                          action={adjustExpenseAction}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="expenseId" value={e.id} />
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
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  No expenses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
