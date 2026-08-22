"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Segment-level error boundary (Next.js App Router convention). Catches
 * rendering errors below the root layout so a real user sees a recoverable
 * screen instead of a raw crash — any layout above this boundary (e.g.
 * GymNav in app/gym/[gymId]/layout.tsx) keeps rendering normally.
 *
 * console.error here runs in the browser (this is a Client Component),
 * not the server — see app/gym/[gymId]/layout.tsx and app/api/ai/route.ts
 * for the server-side logging added alongside this.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[error boundary]", error.message);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-text-secondary">
        An unexpected error occurred. You can try again, or head back home.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="secondary" onClick={() => router.push("/")}>
          Go home
        </Button>
      </div>
    </div>
  );
}
