import { PageHeader } from "@/components/ui/PageHeader";

/**
 * All navigation (including logout) now lives in the persistent GymNav
 * shell rendered by app/gym/[gymId]/layout.tsx (Phase 9.5) — this page is
 * just the landing view, not a link list anymore.
 */
export default function GymHomePage() {
  return (
    <main className="p-6 md:p-8">
      <PageHeader title="Welcome back" description="Use the navigation to manage your gym." />
    </main>
  );
}
