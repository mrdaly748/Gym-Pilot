import { requestPasswordResetAction } from "../actions";
import { AuthCard } from "@/components/ui/AuthCard";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p role="status" className="text-sm text-text-secondary">
          If an account exists for that email address, a password reset link
          has been sent.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password">
      <form action={requestPasswordResetAction} className="flex flex-col gap-4">
        <TextInput label="Email" type="email" name="email" required autoComplete="email" />
        <Button type="submit" variant="primary" className="mt-1 w-full">
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
