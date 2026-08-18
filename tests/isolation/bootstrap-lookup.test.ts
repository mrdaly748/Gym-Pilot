import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedGym,
  seedMembership,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * The bootstrap case (docs/architecture.md §5.3b): resolving "which gym
 * does this user belong to" requires querying gym_memberships before gymId
 * is known. Proves that lookup is itself RLS-protected via
 * app.current_user_id, not an unprotected special case.
 */
describe("bootstrap lookup: gym_memberships visibility before gymId is known", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let userA: SeededUser;
  let userB: SeededUser;

  beforeAll(() => {
    owner = getOwnerPool();
    app = getAppUserPool();
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  beforeEach(async () => {
    await resetTestData(owner);
    gymA = await seedGym(owner, "Gym A");
    userA = await seedUser(owner, "user-a@test.local");
    userB = await seedUser(owner, "user-b@test.local");
    await seedMembership(owner, {
      userId: userA.id,
      gymId: gymA.id,
      role: "GYM_ADMIN",
    });
  });

  it("a session with only app.current_user_id set can find its own membership row", async () => {
    const rows = await withRawContext(
      app,
      { userId: userA.id }, // exactly the bootstrap case: no gymId yet
      (client) =>
        client.query(
          "SELECT gym_id, role FROM gym_memberships WHERE user_id = $1",
          [userA.id],
        ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].gym_id).toBe(gymA.id);
  });

  it("a session cannot read another user's membership row via the bootstrap path", async () => {
    const rows = await withRawContext(
      app,
      { userId: userB.id }, // userB has no membership row of their own
      (client) =>
        client.query("SELECT id FROM gym_memberships WHERE user_id = $1", [
          userA.id, // attempting to read userA's row
        ]),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("with no app.current_user_id set at all, no membership rows are visible", async () => {
    const rows = await withRawContext(app, {}, (client) =>
      client.query("SELECT id FROM gym_memberships"),
    );
    expect(rows.rows).toHaveLength(0);
  });
});
