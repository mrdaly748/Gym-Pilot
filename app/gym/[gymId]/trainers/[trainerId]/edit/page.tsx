import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getTrainer } from "@/lib/server/services/trainers";
import { updateTrainerAction } from "../../actions";

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
    <main className="p-8">
      <Link href={`/gym/${gymId}/trainers`} className="text-sm underline">
        &larr; Trainers
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Edit {trainer.name}</h1>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <form
        action={updateTrainerAction}
        className="mt-4 flex max-w-sm flex-col gap-3"
      >
        <input type="hidden" name="gymId" value={gymId} />
        <input type="hidden" name="trainerId" value={trainer.id} />
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            name="name"
            required
            defaultValue={trainer.name}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact phone (optional)
          <input
            type="tel"
            name="contactPhone"
            defaultValue={trainer.contactPhone ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Contact email (optional)
          <input
            type="email"
            name="contactEmail"
            defaultValue={trainer.contactEmail ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Specialty / notes (optional)
          <input
            type="text"
            name="specialty"
            defaultValue={trainer.specialty ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-2 text-white"
        >
          Save changes
        </button>
      </form>
    </main>
  );
}
