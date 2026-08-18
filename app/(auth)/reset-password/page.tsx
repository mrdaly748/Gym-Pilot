import { resetPasswordAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  update_failed: "Could not update your password. Please try again.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
        </p>
      )}
      <form action={resetPasswordAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-2 text-white"
        >
          Update password
        </button>
      </form>
    </main>
  );
}
