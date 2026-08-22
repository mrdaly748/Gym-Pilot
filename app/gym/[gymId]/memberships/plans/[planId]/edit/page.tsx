import { notFound } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getPlan } from "@/lib/server/services/plans";
import { updatePlanAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";

export default async function EditPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string; planId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId, planId } = await params;
  const { error } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const plan = await getPlan(
    { userId: session.userId, gymId, role: session.role },
    planId,
  );
  if (!plan) {
    notFound();
  }

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title={`Edit ${plan.name}`}
        backHref={`/gym/${gymId}/memberships/plans`}
        backLabel="Membership Plans"
      />

      <div className="max-w-sm">
        <Flash error={error} />
        <form action={updatePlanAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <input type="hidden" name="planId" value={plan.id} />
          <TextInput label="Plan name" type="text" name="name" required defaultValue={plan.name} />
          <TextInput
            label="Price (TND, 0 for a free trial)"
            type="number"
            name="price"
            step="0.001"
            min="0"
            required
            defaultValue={(plan.priceMillimes / 1000).toString()}
          />
          <TextInput
            label="Duration (days)"
            type="number"
            name="durationDays"
            step="1"
            min="1"
            required
            defaultValue={plan.durationDays.toString()}
          />
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </form>
      </div>
    </main>
  );
}
