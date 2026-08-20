import Link from "next/link";
import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import Chat from "./Chat";

/**
 * Gym-Admin-only (product-spec.md §15.5, D9 confirmed): Gym Staff has no
 * AI access in MVP. Same try/catch/redirect pattern as
 * app/gym/[gymId]/analytics/page.tsx and staff/page.tsx — a Staff (or
 * unauthenticated) session is redirected straight back to the gym home
 * page, never rendered with an authorization error.
 */
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;

  try {
    await requireGym(gymId);
    await requireRole("GYM_ADMIN");
  } catch {
    redirect(`/gym/${gymId}`);
  }

  return (
    <main className="p-8">
      <Link href={`/gym/${gymId}`} className="text-sm underline">
        &larr; Gym
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Assistant</h1>
      <p className="mt-1 text-sm text-gray-600">
        Ask questions about your gym&rsquo;s own data. Answers are grounded
        in your actual records — the assistant cannot create, edit, or
        delete anything.
      </p>
      <Chat />
    </main>
  );
}
