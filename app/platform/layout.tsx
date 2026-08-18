import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server/auth";

/**
 * Route-guard shell only — no feature pages yet (Phase 2 builds gym
 * provisioning). See docs/implementation-plan.md Phase 1.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireRole("PLATFORM_ADMIN");
  } catch {
    redirect("/login");
  }

  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
