import { requestPasswordResetAction } from "../actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-gray-600">
          If an account exists for that email address, a password reset link
          has been sent.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <form action={requestPasswordResetAction} className="flex flex-col gap-3">
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
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-2 text-white"
        >
          Send reset link
        </button>
      </form>
    </main>
  );
}
