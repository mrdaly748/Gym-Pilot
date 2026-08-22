import "server-only";

/**
 * Minimal liveness check (Phase 10 scope). Confirms the application
 * process is up and serving requests — deliberately does not touch the
 * database or any external service. A DB-connectivity check here would
 * turn a transient pool/network blip into a false "app is down" signal;
 * database health is a separate concern from process liveness.
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" });
}
