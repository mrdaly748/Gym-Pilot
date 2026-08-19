import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — anon key only, never the service-role key
 * (that stays confined to lib/server/supabaseAdmin.ts, server-only). Uses
 * @supabase/ssr's cookie-based session storage, the same format
 * lib/server/supabase.ts's server client reads — so a session established
 * here (via setSession()/exchangeCodeForSession(), see
 * app/auth/callback/page.tsx, the only current caller) is immediately
 * visible server-side on the next request, with no extra sync step.
 *
 * Deliberately outside lib/server/ — this file is meant to be imported into
 * a Client Component and bundled to the browser.
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
