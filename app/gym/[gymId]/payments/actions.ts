"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { adjustPayment, recordPayment, voidPayment } from "@/lib/server/services/payments";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  return fallback;
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN", "GYM_STAFF");

  const membershipId = String(formData.get("membershipId") ?? "");
  const amountMillimes = Math.round(
    Number.parseFloat(String(formData.get("amount") ?? "")) * 1000,
  );
  const method = String(formData.get("method") ?? "");

  try {
    await recordPayment(
      { userId: session.userId, gymId, role: session.role },
      { membershipId, amountMillimes, method },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not record payment.");
    redirect(`/gym/${gymId}/payments?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/payments?success=${encodeURIComponent("Payment recorded.")}`);
}

/** Gym Admin only — requireRole enforces this here; the RLS policy (Gym-Admin-only INSERT) enforces it independently at the database layer. */
export async function adjustPaymentAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const paymentId = String(formData.get("paymentId") ?? "");
  const amountMillimes = Math.round(
    Number.parseFloat(String(formData.get("amount") ?? "")) * 1000,
  );
  const reason = String(formData.get("reason") ?? "") || undefined;

  try {
    await adjustPayment(
      { userId: session.userId, gymId, role: session.role },
      paymentId,
      { amountMillimes, reason },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not adjust payment.");
    redirect(`/gym/${gymId}/payments?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/payments?success=${encodeURIComponent("Adjustment recorded.")}`);
}

/**
 * A full void is just an adjustment that brings the effective amount to
 * exactly zero — same mechanism as adjustPaymentAction, a distinct action
 * only in the UI. The amount is always recomputed server-side inside
 * voidPayment() itself, from the database, never from a client-supplied
 * value — a page render (or an open tab) can be stale relative to a
 * since-applied adjustment.
 */
export async function voidPaymentAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const paymentId = String(formData.get("paymentId") ?? "");

  try {
    await voidPayment({ userId: session.userId, gymId, role: session.role }, paymentId);
  } catch (error) {
    const message = errorMessage(error, "Could not void payment.");
    redirect(`/gym/${gymId}/payments?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/payments?success=${encodeURIComponent("Payment voided.")}`);
}
