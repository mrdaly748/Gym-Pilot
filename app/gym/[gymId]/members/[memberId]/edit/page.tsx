import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getMember } from "@/lib/server/services/members";
import { updateMemberAction } from "../../actions";

export default async function EditMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string; memberId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { gymId, memberId } = await params;
  const { error } = await searchParams;
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const member = await getMember(
    { userId: session.userId, gymId, role: session.role },
    memberId,
  );
  if (!member) {
    notFound();
  }

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}/members`} className="text-sm underline">
        &larr; Members
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Edit {member.name}</h1>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <form
        action={updateMemberAction}
        className="mt-4 flex max-w-sm flex-col gap-3"
      >
        <input type="hidden" name="gymId" value={gymId} />
        <input type="hidden" name="memberId" value={member.id} />
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <input
            type="text"
            name="name"
            required
            defaultValue={member.name}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone
          <input
            type="tel"
            name="phone"
            required
            defaultValue={member.phone}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Join date
          <input
            type="date"
            name="joinDate"
            required
            defaultValue={new Date(member.joinDate).toISOString().slice(0, 10)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Emergency contact name (optional)
          <input
            type="text"
            name="emergencyContactName"
            defaultValue={member.emergencyContactName ?? ""}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Emergency contact phone (optional)
          <input
            type="tel"
            name="emergencyContactPhone"
            defaultValue={member.emergencyContactPhone ?? ""}
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
