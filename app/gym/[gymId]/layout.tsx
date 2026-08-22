import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { AuthenticationError, AuthorizationError } from "@/lib/server/errors";
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
  } catch (error) {
    // AuthenticationError/AuthorizationError are the normal, expected
    // outcome of an unauthenticated or unauthorized visit — not logged.
    // Anything else (e.g. a database/connection failure inside
    // getSessionContext()) is a genuine failure worth a server-side trace,
    // since it would otherwise be indistinguishable from "not logged in".
    if (!(error instanceof AuthenticationError) && !(error instanceof AuthorizationError)) {
      console.error(
        "[GymLayout] Unexpected error resolving session",
        error instanceof Error ? error.message : error,
      );
    }
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <GymNav gymId={gymId} role={session.role} />
      <div className="flex-1 md:overflow-y-auto">{children}</div>
    </div>
  );
}
