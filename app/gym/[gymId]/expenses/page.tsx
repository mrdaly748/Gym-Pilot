import { requireGym, requireRole } from "@/lib/server/auth";
import { EXPENSE_CATEGORIES, listExpenses } from "@/lib/server/services/expenses";
import { adjustExpenseAction, recordExpenseAction, voidExpenseAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId } = await params;
  const { error, success } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const context = { userId: session.userId, gymId, role: session.role };
  const expenses = await listExpenses(context);

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Expenses" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Record an expense" error={error}>
        <form action={recordExpenseAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <Select label="Category" name="category" required defaultValue={EXPENSE_CATEGORIES[0]}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <TextInput label="Amount (TND)" type="number" name="amount" step="0.001" min="0.001" required />
          <TextInput
            label="Date"
            type="date"
            name="expenseDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <TextInput label="Note (optional)" type="text" name="note" />
          <Button type="submit" variant="primary">
            Record expense
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All expenses
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Amount</Th>
                <Th>Effective</Th>
                <Th>Recorded by</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {expenses.map((e) => (
                <Tr key={e.id}>
                  <Td className="text-text-secondary">{formatDate(e.expenseDate)}</Td>
                  <Td className="font-medium">{e.category}</Td>
                  <Td className="text-text-secondary">{formatMillimes(e.amountMillimes)}</Td>
                  <Td>
                    {formatMillimes(e.effectiveAmountMillimes)}
                    {e.adjustments.length > 0 && (
                      <span className="ml-1 text-xs text-text-tertiary">
                        ({e.adjustments.length} adjustment
                        {e.adjustments.length > 1 ? "s" : ""})
                      </span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{e.recordedByEmail}</Td>
                  <Td>
                    {e.effectiveAmountMillimes > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={voidExpenseAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="expenseId" value={e.id} />
                          <input
                            type="hidden"
                            name="effectiveAmountMillimes"
                            value={e.effectiveAmountMillimes}
                          />
                          <ConfirmSubmitButton
                            confirmTitle="Void this expense?"
                            confirmMessage="This records a full offsetting adjustment — the original expense stays in the audit trail, it is never deleted."
                            confirmLabel="Void expense"
                          >
                            Void
                          </ConfirmSubmitButton>
                        </form>
                        <details>
                          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-3 hover:text-foreground">
                            Adjust
                          </summary>
                          <form
                            action={adjustExpenseAction}
                            className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-1 p-3"
                          >
                            <input type="hidden" name="gymId" value={gymId} />
                            <input type="hidden" name="expenseId" value={e.id} />
                            <TextInput
                              label="Adjustment amount (TND)"
                              type="number"
                              name="amount"
                              step="0.001"
                              required
                              hint="Negative to reduce, positive to add"
                            />
                            <TextInput label="Reason (optional)" type="text" name="reason" />
                            <Button type="submit" variant="primary" className="self-start">
                              Submit adjustment
                            </Button>
                          </form>
                        </details>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
              {expenses.length === 0 && <EmptyRow colSpan={6}>No expenses yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
