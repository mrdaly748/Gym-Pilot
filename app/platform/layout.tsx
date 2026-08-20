import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server/auth";
import { PlatformNav } from "@/components/PlatformNav";

/**
 * Route-guard shell + nav (Phase 9.5). See app/gym/[gymId]/layout.tsx's
 * equivalent comment — same "presentation only" reasoning applies here.
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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PlatformNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
