import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";

export default function PlatformHomePage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Platform Admin</h1>
      <Link href="/platform/gyms" className="mt-4 block text-sm underline">
        Manage gyms
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="mt-4 text-sm underline">
          Log out
        </button>
      </form>
    </main>
  );
}
