import Link from "next/link";
import { loginAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  no_membership:
    "This account has no gym access yet. Contact your administrator.",
  session_expired: "Your session expired. Please log in again.",
  gym_suspended:
    "This gym's account is currently inactive. Contact your gym administrator.",
  account_disabled:
    "This account has been disabled. Contact your gym administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Log in</h1>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
        </p>
      )}
      <form action={loginAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-2 text-white"
        >
          Log in
        </button>
      </form>
      <Link href="/forgot-password" className="text-sm underline">
        Forgot your password?
      </Link>
    </main>
  );
}
