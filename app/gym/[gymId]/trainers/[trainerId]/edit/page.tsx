import { notFound } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getTrainer } from "@/lib/server/services/trainers";
import { updateTrainerAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";

export default async function EditTrainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string; trainerId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId, trainerId } = await params;
  const { error } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const trainer = await getTrainer(
    { userId: session.userId, gymId, role: session.role },
    trainerId,
  );
  if (!trainer) {
    notFound();
  }

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title={`Edit ${trainer.name}`}
        backHref={`/gym/${gymId}/trainers`}
        backLabel="Trainers"
      />

      <div className="max-w-sm">
        <Flash error={error} />
        <form action={updateTrainerAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <input type="hidden" name="trainerId" value={trainer.id} />
          <TextInput label="Name" type="text" name="name" required defaultValue={trainer.name} />
          <TextInput
            label="Contact phone (optional)"
            type="tel"
            name="contactPhone"
            defaultValue={trainer.contactPhone ?? ""}
          />
          <TextInput
            label="Contact email (optional)"
            type="email"
            name="contactEmail"
            defaultValue={trainer.contactEmail ?? ""}
          />
          <TextInput
            label="Specialty / notes (optional)"
            type="text"
            name="specialty"
            defaultValue={trainer.specialty ?? ""}
          />
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </form>
      </div>
    </main>
  );
}
