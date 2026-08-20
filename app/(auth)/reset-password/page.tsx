import { resetPasswordAction } from "../actions";
import { AuthCard } from "@/components/ui/AuthCard";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Flash } from "@/components/ui/Flash";

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
    <AuthCard title="Set a new password">
      <Flash error={error ? (ERROR_MESSAGES[error] ?? "Something went wrong. Please try again.") : undefined} />
      <form action={resetPasswordAction} className="flex flex-col gap-4">
        <TextInput
          label="New password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" variant="primary" className="mt-1 w-full">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
