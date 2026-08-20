import { listGyms } from "@/lib/server/services/platformAdmin";
import {
  createGymAction,
  reactivateGymAction,
  suspendGymAction,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/FormSection";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";

/**
 * Role/authentication is already guarded by app/platform/layout.tsx
 * (requireRole("PLATFORM_ADMIN")) — matching the Phase 1 convention of not
 * re-checking at the page level. The Server Actions this page's forms
 * submit to are guarded independently (they're reachable outside this
 * page's render tree), see ./actions.ts.
 */
export default async function PlatformGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const gyms = await listGyms();

  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Gyms" backHref="/platform" backLabel="Platform Admin" />

      <FormSection title="Create a gym" error={error}>
        <form action={createGymAction} className="flex flex-col gap-3">
          <TextInput label="Gym name" type="text" name="name" required />
          <TextInput label="Initial Gym Admin email" type="email" name="adminEmail" required />
          <Button type="submit" variant="primary">
            Create gym &amp; invite admin
          </Button>
        </form>
      </FormSection>

      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          All gyms
        </h2>
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Action</Th>
              </tr>
            </Thead>
            <tbody>
              {gyms.map((gym) => (
                <Tr key={gym.id}>
                  <Td className="font-medium">{gym.name}</Td>
                  <Td>
                    <Badge status={gym.status === "SUSPENDED" ? "suspended" : "active"} />
                  </Td>
                  <Td className="text-text-secondary">{gym.createdAt.toLocaleDateString()}</Td>
                  <Td>
                    {gym.status === "ACTIVE" ? (
                      <form action={suspendGymAction}>
                        <input type="hidden" name="gymId" value={gym.id} />
                        <ConfirmSubmitButton
                          confirmTitle="Suspend this gym?"
                          confirmMessage={`${gym.name} and its staff will immediately lose access. You can reactivate it later.`}
                          confirmLabel="Suspend"
                        >
                          Suspend
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <form action={reactivateGymAction}>
                        <input type="hidden" name="gymId" value={gym.id} />
                        <Button type="submit" variant="ghost">
                          Reactivate
                        </Button>
                      </form>
                    )}
                  </Td>
                </Tr>
              ))}
              {gyms.length === 0 && <EmptyRow colSpan={4}>No gyms yet.</EmptyRow>}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
