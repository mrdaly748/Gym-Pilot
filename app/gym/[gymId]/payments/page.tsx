import { requireGym, requireRole } from "@/lib/server/auth";
import { listMemberships } from "@/lib/server/services/memberships";
import { gymOutstandingBalance, listPaymentsPage } from "@/lib/server/services/payments";
import { adjustPaymentAction, recordPaymentAction, voidPaymentAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { StatCard } from "@/components/ui/StatCard";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";
import { Pagination } from "@/components/ui/Pagination";
import { PaymentsIcon } from "@/components/ui/icons";

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
  searchParams: Promise<{ error?: string; success?: string; page?: string }>;
}) {
  const { gymId } = await params;
  const { error, success, page: rawPage } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const parsedPage = Number(rawPage);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;

  const context = { userId: session.userId, gymId, role: session.role };
  const [paymentsPage, memberships] = await Promise.all([
    listPaymentsPage(context, { page }),
    listMemberships(context),
  ]);
  const payments = paymentsPage.items;
  const outstandingBalance =
    session.role === "GYM_ADMIN" ? await gymOutstandingBalance(context) : null;

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Payments" backHref={`/gym/${gymId}`} backLabel="Gym" />

      {outstandingBalance !== null && (
        <div className="mb-6 max-w-xs">
          <StatCard
            label="Outstanding balance"
            value={formatMillimes(outstandingBalance)}
            icon={<PaymentsIcon className="h-4.5 w-4.5" />}
            tone="warning"
          />
        </div>
      )}

      <FormSection title="Record a payment" error={error}>
        <form action={recordPaymentAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <Select label="Membership" name="membershipId" required defaultValue="">
            <option value="" disabled>
              Select a membership
            </option>
            {memberships.map((m) => (
              <option key={m.id} value={m.id}>
                {m.memberName} — {m.planNameSnapshot}
              </option>
            ))}
          </Select>
          <TextInput label="Amount (TND)" type="number" name="amount" step="0.001" min="0.001" required />
          <TextInput label="Method" type="text" name="method" required defaultValue="cash" />
          <Button type="submit" variant="primary">
            Record payment
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All payments
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Date</Th>
                <Th>Amount</Th>
                <Th>Effective</Th>
                <Th>Method</Th>
                <Th>Recorded by</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="text-text-secondary">{formatDate(p.paidAt)}</Td>
                  <Td className="font-medium">{formatMillimes(p.amountMillimes)}</Td>
                  <Td>
                    {formatMillimes(p.effectiveAmountMillimes)}
                    {p.adjustments.length > 0 && (
                      <span className="ml-1 text-xs text-text-tertiary">
                        ({p.adjustments.length} adjustment
                        {p.adjustments.length > 1 ? "s" : ""})
                      </span>
                    )}
                  </Td>
                  <Td className="text-text-secondary">{p.method}</Td>
                  <Td className="text-text-secondary">{p.recordedByEmail}</Td>
                  <Td>
                    {session.role === "GYM_ADMIN" && p.effectiveAmountMillimes > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={voidPaymentAction}>
                          <input type="hidden" name="gymId" value={gymId} />
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input
                            type="hidden"
                            name="effectiveAmountMillimes"
                            value={p.effectiveAmountMillimes}
                          />
                          <ConfirmSubmitButton
                            confirmTitle="Void this payment?"
                            confirmMessage="This records a full offsetting adjustment — the original payment stays in the audit trail, it is never deleted."
                            confirmLabel="Void payment"
                          >
                            Void
                          </ConfirmSubmitButton>
                        </form>
                        <details className="group">
                          <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-3 hover:text-foreground">
                            Adjust
                          </summary>
                          <form
                            action={adjustPaymentAction}
                            className="mt-2 flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-1 p-3"
                          >
                            <input type="hidden" name="gymId" value={gymId} />
                            <input type="hidden" name="paymentId" value={p.id} />
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
              {payments.length === 0 && (
                <EmptyRow colSpan={6}>
                  {paymentsPage.totalCount === 0 ? "No payments yet." : "No payments on this page."}
                </EmptyRow>
              )}
            </tbody>
          </Table>
          <Pagination
            page={paymentsPage.page}
            totalPages={paymentsPage.totalPages}
            basePath={`/gym/${gymId}/payments`}
          />
        </div>
      </section>
    </main>
  );
}
