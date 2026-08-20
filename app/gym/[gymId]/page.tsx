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
      <Link
        href={`/gym/${gymId}/dashboard`}
        className="mt-4 block text-sm underline"
      >
        Dashboard
      </Link>
      <Link
        href={`/gym/${gymId}/members`}
        className="mt-4 block text-sm underline"
      >
        Members
      </Link>
      <Link
        href={`/gym/${gymId}/memberships`}
        className="mt-4 block text-sm underline"
      >
        Memberships
      </Link>
      <Link
        href={`/gym/${gymId}/payments`}
        className="mt-4 block text-sm underline"
      >
        Payments
      </Link>
      <Link
        href={`/gym/${gymId}/attendance`}
        className="mt-4 block text-sm underline"
      >
        Attendance
      </Link>
      {session.role === "GYM_ADMIN" && (
        <>
          <Link
            href={`/gym/${gymId}/memberships/plans`}
            className="mt-4 block text-sm underline"
          >
            Manage plans
          </Link>
          <Link
            href={`/gym/${gymId}/staff`}
            className="mt-4 block text-sm underline"
          >
            Manage staff
          </Link>
          <Link
            href={`/gym/${gymId}/trainers`}
            className="mt-4 block text-sm underline"
          >
            Trainers
          </Link>
          <Link
            href={`/gym/${gymId}/expenses`}
            className="mt-4 block text-sm underline"
          >
            Expenses
          </Link>
          <Link
            href={`/gym/${gymId}/analytics`}
            className="mt-4 block text-sm underline"
          >
            Analytics
          </Link>
          <Link
            href={`/gym/${gymId}/assistant`}
            className="mt-4 block text-sm underline"
          >
            Assistant
          </Link>
        </>
      )}
      <form action={logoutAction}>
        <button type="submit" className="mt-4 text-sm underline">
          Log out
        </button>
      </form>
    </main>
  );
}
