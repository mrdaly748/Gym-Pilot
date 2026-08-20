import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { GymNav } from "@/components/GymNav";

/**
 * Route-guard shell + persistent nav (Phase 9.5). GymNav is presentation
 * only — it receives the already-verified role below and renders links;
 * every route it links to still enforces its own requireRole() check
 * independently (see each page.tsx), so hiding a link here changes nothing
 * about what's actually authorized.
 */
export default async function GymLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;

  let session;
  try {
    session = await requireGym(gymId);
    await requireRole("GYM_ADMIN", "GYM_STAFF");
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <GymNav gymId={gymId} role={session.role} />
      <div className="flex-1 md:overflow-y-auto">{children}</div>
    </div>
  );
}
