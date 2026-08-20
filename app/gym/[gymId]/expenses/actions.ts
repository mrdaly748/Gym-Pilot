"use server";

import { redirect } from "next/navigation";
import { requireGym, requireRole } from "@/lib/server/auth";
import { adjustExpense, recordExpense } from "@/lib/server/services/expenses";
import { NotFoundError, ValidationError } from "@/lib/server/errors";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  return fallback;
}

export async function recordExpenseAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const category = String(formData.get("category") ?? "");
  const amountMillimes = Math.round(
    Number.parseFloat(String(formData.get("amount") ?? "")) * 1000,
  );
  const expenseDate = new Date(String(formData.get("expenseDate") ?? ""));
  const note = String(formData.get("note") ?? "") || undefined;

  try {
    await recordExpense(
      { userId: session.userId, gymId, role: session.role },
      { category, amountMillimes, expenseDate, note },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not record expense.");
    redirect(`/gym/${gymId}/expenses?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/expenses?success=${encodeURIComponent("Expense recorded.")}`);
}

/** Gym Admin only — requireRole enforces this here; the RLS policy (Gym-Admin-only INSERT) enforces it independently at the database layer. */
export async function adjustExpenseAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const expenseId = String(formData.get("expenseId") ?? "");
  const amountMillimes = Math.round(
    Number.parseFloat(String(formData.get("amount") ?? "")) * 1000,
  );
  const reason = String(formData.get("reason") ?? "") || undefined;

  try {
    await adjustExpense(
      { userId: session.userId, gymId, role: session.role },
      expenseId,
      { amountMillimes, reason },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not adjust expense.");
    redirect(`/gym/${gymId}/expenses?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/expenses?success=${encodeURIComponent("Adjustment recorded.")}`);
}

/** A full void is just an adjustment for the negative of the current effective amount — same mechanism as adjustExpenseAction, a distinct action only in the UI. */
export async function voidExpenseAction(formData: FormData): Promise<void> {
  const gymId = String(formData.get("gymId") ?? "");
  const session = await requireGym(gymId);
  await requireRole("GYM_ADMIN");

  const expenseId = String(formData.get("expenseId") ?? "");
  const effectiveAmountMillimes = Number.parseInt(
    String(formData.get("effectiveAmountMillimes") ?? "0"),
    10,
  );

  try {
    await adjustExpense(
      { userId: session.userId, gymId, role: session.role },
      expenseId,
      { amountMillimes: -effectiveAmountMillimes, reason: "Voided" },
    );
  } catch (error) {
    const message = errorMessage(error, "Could not void expense.");
    redirect(`/gym/${gymId}/expenses?error=${encodeURIComponent(message)}`);
  }

  redirect(`/gym/${gymId}/expenses?success=${encodeURIComponent("Expense voided.")}`);
}
