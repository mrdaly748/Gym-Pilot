import { notFound } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { getMember } from "@/lib/server/services/members";
import { updateMemberAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";

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
    <main className="p-6 md:p-8">
      <PageHeader
        title={`Edit ${member.name}`}
        backHref={`/gym/${gymId}/members`}
        backLabel="Members"
      />

      <div className="max-w-sm">
        <Flash error={error} />
        <form action={updateMemberAction} className="flex flex-col gap-3">
          <input type="hidden" name="gymId" value={gymId} />
          <input type="hidden" name="memberId" value={member.id} />
          <TextInput label="Full name" type="text" name="name" required defaultValue={member.name} />
          <TextInput label="Phone" type="tel" name="phone" required defaultValue={member.phone} />
          <TextInput
            label="Join date"
            type="date"
            name="joinDate"
            required
            defaultValue={new Date(member.joinDate).toISOString().slice(0, 10)}
          />
          <TextInput
            label="Emergency contact name (optional)"
            type="text"
            name="emergencyContactName"
            defaultValue={member.emergencyContactName ?? ""}
          />
          <TextInput
            label="Emergency contact phone (optional)"
            type="tel"
            name="emergencyContactPhone"
            defaultValue={member.emergencyContactPhone ?? ""}
          />
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </form>
      </div>
    </main>
  );
}
