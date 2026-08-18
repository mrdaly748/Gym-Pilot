import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { getSessionContext } from "@/lib/server/auth";

export default async function GymHomePage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;
  // Already verified by app/gym/[gymId]/layout.tsx — read again (cached per
  // request via React's cache()) only to decide whether to show the
  // Gym-Admin-only "Manage staff" link.
  const session = await getSessionContext();

  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Gym {gymId}</h1>
      <p className="text-sm text-gray-600">
        Members, memberships, payments, attendance, trainers, and expenses
        arrive in later phases.
      </p>
      {session.role === "GYM_ADMIN" && (
        <Link
          href={`/gym/${gymId}/staff`}
          className="mt-4 block text-sm underline"
        >
          Manage staff
        </Link>
      )}
      <form action={logoutAction}>
        <button type="submit" className="mt-4 text-sm underline">
          Log out
        </button>
      </form>
    </main>
  );
}
