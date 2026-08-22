"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

/**
 * Establishes a Supabase session from an email link and hands off to
 * /reset-password — replaces the old server-only /auth/callback Route
 * Handler, which could only read a PKCE `?code=` and had no way to read a
 * URL fragment (fragments are never sent to a server, by HTTP/URL
 * definition). Admin-initiated invites (lib/server/supabaseAdmin.ts's
 * inviteUserByEmail(), called with no browser involved) structurally
 * cannot attach PKCE state, so Supabase delivers those as a
 * `#access_token=...` fragment instead — only client-side code can read
 * that. Self-service password-reset-by-email (resetPasswordForEmail(),
 * called from a pkce-flow client) does attach PKCE state and arrives as
 * `?code=...`. This page handles both, since only a client can see the
 * fragment case and there's no reason to duplicate the logic across a
 * server route and a client page.
 *
 * Uses the @supabase/ssr browser client (lib/supabaseBrowser.ts) so the
 * resulting session is written to the same cookie format
 * lib/server/supabase.ts's server client reads — not localStorage, which
 * the server could never see.
 */

/** Only ever a same-origin relative path — never treat `next` as an open redirect. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = safeNext(searchParams.get("next"));
      const code = searchParams.get("code");
      const queryError = searchParams.get("error");

      if (queryError) {
        if (!cancelled) {
          setFailed(true);
          router.replace("/login?error=auth_callback_failed");
        }
        return;
      }

      const supabase = createSupabaseBrowserClient();

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hashParams = new URLSearchParams(
            window.location.hash.replace(/^#/, ""),
          );
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashError = hashParams.get("error");
          if (hashError || !accessToken || !refreshToken) {
            throw new Error(
              hashError ?? "No code or session tokens present in callback URL.",
            );
          }
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }

        if (!cancelled) {
          router.replace(next);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          router.replace("/login?error=auth_callback_failed");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-8">
      <p className="text-sm text-text-secondary" role="status">
        {failed ? "Something went wrong. Redirecting…" : "Signing you in…"}
      </p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackInner />
    </Suspense>
  );
}
