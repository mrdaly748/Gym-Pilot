"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "./icons";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent-strong text-accent-foreground hover:bg-accent-strong-hover",
  secondary: "border border-border-subtle bg-surface-2 text-foreground hover:bg-surface-3",
  danger: "bg-danger-strong text-white hover:bg-danger-strong-hover",
  ghost: "text-text-secondary hover:bg-surface-3 hover:text-foreground",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

/**
 * When used as a submit button (type="submit"), reflects the enclosing
 * <form>'s pending state via useFormStatus (React 19, no dependency) — the
 * button disables itself and shows a spinner while its Server Action runs,
 * without any caller-managed loading state.
 */
export function Button({
  variant = "secondary",
  className = "",
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const { pending } = useFormStatus();
  const isPending = type === "submit" && pending;

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || isPending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {isPending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
