import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Navigation (including logout) lives in the persistent PlatformNav shell
 * rendered by app/platform/layout.tsx (Phase 9.5).
 */
export default function PlatformHomePage() {
  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Platform Admin" description="Use the navigation to manage gym accounts." />
    </main>
  );
}
