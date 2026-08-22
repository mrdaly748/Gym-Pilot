"use client";

import "./globals.css";
import { useEffect } from "react";

/**
 * Root-level error boundary (Next.js App Router convention) — only
 * activates if the root layout itself throws, which app/error.tsx cannot
 * catch. Must render its own <html>/<body> since it fully replaces the
 * root layout in that case, so it's kept self-contained (no shared
 * component imports) rather than depending on anything that could itself
 * be part of what just failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error.message);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-text-secondary">
          The application hit an unexpected error. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-accent-strong px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-strong-hover"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
