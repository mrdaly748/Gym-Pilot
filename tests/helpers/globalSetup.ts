import { startTestDatabase, stopTestDatabase } from "./testDb";

/** Vitest globalSetup: one ephemeral Postgres for the whole test:db run. */
export default async function setup() {
  await startTestDatabase();
  return async () => {
    await stopTestDatabase();
  };
}
