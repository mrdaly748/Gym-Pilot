import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { listPlans } from "@/lib/server/services/plans";
import { archivePlanAction, createPlanAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { Flash } from "@/components/ui/Flash";

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
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { gymId } = await params;
  const { error, success } = await searchParams;

  let session;
  try {
    session = await requireGym(gymId);
    await requireRole("GYM_ADMIN");
  } catch {
    redirect(`/gym/${gymId}`);
  }

  const plans = await listPlans({ userId: session.userId, gymId, role: session.role });

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Membership Plans" backHref={`/gym/${gymId}`} backLabel="Gym" />

      <FormSection title="Create a plan" error={error}>
        <form action={createPlanAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <TextInput label="Plan name" type="text" name="name" required />
          <TextInput
            label="Price (TND, 0 for a free trial)"
            type="number"
            name="price"
            step="0.001"
            min="0"
            required
            defaultValue="0"
          />
          <TextInput
            label="Duration (days)"
            type="number"
            name="durationDays"
            step="1"
            min="1"
            required
            defaultValue="30"
          />
          <Button type="submit" variant="primary">
            Create plan
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All plans
        </h2>
        <div className="mt-3">
          {!error && <Flash success={success} />}
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Price</Th>
                <Th>Duration</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {plans.map((plan) => (
                <Tr key={plan.id}>
                  <Td className="font-medium">{plan.name}</Td>
                  <Td className="text-text-secondary">{formatPrice(plan.priceMillimes)}</Td>
                  <Td className="text-text-secondary">{plan.durationDays} days</Td>
                  <Td>
                    <Badge status={plan.archivedAt ? "archived" : "active"} />
                  </Td>
                  <Td>
                    {!plan.archivedAt && (
                      <form action={archivePlanAction}>
                        <input type="hidden" name="gymId" value={gymId} />
                        <input type="hidden" name="planId" value={plan.id} />
                        <ConfirmSubmitButton
                          confirmTitle="Archive this plan?"
                          confirmMessage={`${plan.name} will no longer be selectable for new memberships. Existing history is preserved and this can be undone.`}
                          confirmLabel="Archive"
                        >
                          Archive
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
              {plans.length === 0 && <EmptyRow colSpan={5}>No plans yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
