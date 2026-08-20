"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * UX safeguard only — NOT a security boundary. The trigger button below has
 * type="button" (never submits by itself); only the dialog's own Confirm
 * button has type="submit". Because the native <dialog> stays in place in
 * the DOM (no portal), that Confirm button remains a real descendant of
 * whatever <form action={...}> this component is rendered inside, so
 * clicking it submits that form exactly as a plain submit button would —
 * the Server Action's own requireRole()/requireGym() checks are what
 * actually authorize the action, unchanged by this component.
 *
 * The trigger button keeps the exact same accessible name the caller
 * passes as children, so existing getByRole("button", { name }) lookups
 * still resolve to it — an added click on the dialog's Confirm button is
 * required to actually submit, which is a real, intentional interaction
 * change (not a selector break).
 */
export function ConfirmSubmitButton({
  children,
  confirmTitle,
  confirmMessage,
  confirmLabel = "Confirm",
  variant = "danger",
}: {
  children: ReactNode;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel?: string;
  variant?: "danger" | "secondary";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => dialogRef.current?.showModal()}>
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-2 p-0 text-foreground backdrop:bg-black/60"
      >
        <div className="p-5">
          <h2 className="text-base font-semibold text-foreground">{confirmTitle}</h2>
          <p className="mt-2 text-sm text-text-secondary">{confirmMessage}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant={variant}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
