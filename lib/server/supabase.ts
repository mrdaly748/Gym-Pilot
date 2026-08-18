import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client for Server Components/Actions/Route Handlers.
 * Only ever used for Auth operations (session verification, sign-in/out,
 * password reset) — business data goes through Prisma (lib/server/db.ts),
 * never through this client. See docs/architecture.md §3.
 *
 * Callers must use `getUser()`, never `getSession()` — getSession() only
 * reads the local cookie and does not verify it against Supabase's Auth
 * server, so it is not safe to use for an authorization decision.
 */
export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, which can't set cookies.
          // middleware.ts refreshes the session on every request instead —
          // safe to ignore here.
        }
      },
    },
  });
}
