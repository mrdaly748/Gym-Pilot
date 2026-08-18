import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";

/**
 * Route-guard shell only — no feature pages yet (Phase 3+ builds
 * members/memberships/payments/etc). See docs/implementation-plan.md Phase 1.
 */
export default async function GymLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;

  try {
    await requireGym(gymId);
    await requireRole("GYM_ADMIN", "GYM_STAFF");
  } catch {
    redirect("/login");
  }

  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
