import "server-only";
import { headers } from "next/headers";

/** Shared by every server action that needs to build a Supabase redirectTo URL. */
export async function currentOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${host}`;
}
