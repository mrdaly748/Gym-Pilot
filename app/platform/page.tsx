import { logoutAction } from "@/app/(auth)/actions";

export default function PlatformHomePage() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Platform Admin</h1>
      <p className="text-sm text-gray-600">
        Phase 1 scaffold — gym provisioning arrives in Phase 2.
      </p>
      <form action={logoutAction}>
        <button type="submit" className="mt-4 text-sm underline">
          Log out
        </button>
      </form>
    </main>
  );
}
