import Link from "next/link";
import { loginAction } from "../actions";
import { AuthCard } from "@/components/ui/AuthCard";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";

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
    <AuthCard title="Log in to GymPilot">
      <Flash error={error ? (ERROR_MESSAGES[error] ?? "Something went wrong. Please try again.") : undefined} />
      <form action={loginAction} className="flex flex-col gap-4">
        <TextInput label="Email" type="email" name="email" required autoComplete="email" />
        <TextInput
          label="Password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
        />
        <Button type="submit" variant="primary" className="mt-1 w-full">
          Log in
        </Button>
      </form>
      <Link
        href="/forgot-password"
        className="mt-4 block text-center text-sm text-text-secondary hover:text-accent"
      >
        Forgot your password?
      </Link>
    </AuthCard>
  );
}
