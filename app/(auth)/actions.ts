"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { resolveIdentity } from "@/lib/server/services/identity";

function destinationForIdentity(gymId: string | null): string {
  return gymId ? `/gym/${gymId}` : "/platform";
}

async function currentOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${host}`;
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect("/login?error=invalid_credentials");
  }

  const identity = await resolveIdentity(data.user.id);
  if (!identity) {
    // Authenticated with Supabase but has no gym_memberships row — not a
    // usable account. Sign out rather than leaving a half-authenticated
    // session sitting around.
    await supabase.auth.signOut();
    redirect("/login?error=no_membership");
  }

  redirect(destinationForIdentity(identity.gymId));
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  formData: FormData,
): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const supabase = await createSupabaseServerClient();
  const origin = await currentOrigin();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Always redirect to the same confirmation state whether or not the email
  // exists — don't reveal account existence via a different response.
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?error=session_expired");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/reset-password?error=update_failed");
  }

  const identity = await resolveIdentity(user.id);
  redirect(destinationForIdentity(identity?.gymId ?? null));
}
