import type { ReactNode } from "react";
import { LogoMark } from "./icons";

/**
 * Shared shell for the three unauthenticated auth screens (login,
 * forgot-password, reset-password) — the product's actual first
 * impression, so it gets the brand mark even though nothing else on these
 * screens needs the full nav shell.
 */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark className="h-11 w-11" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      </div>
      <div className="rounded-lg border border-border-subtle bg-surface-2 p-6">{children}</div>
    </main>
  );
}
