import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getAppUserPool,
  getOwnerPool,
  resetTestData,
  seedAiUsageCounter,
  seedGym,
  seedMembership,
  seedUser,
  withRawContext,
  type SeededGym,
  type SeededUser,
} from "../helpers/testDb";
import type { Pool } from "pg";

/**
 * Phase 9: ai_usage_counters — raw SQL, no application code
 * (docs/architecture.md §5.4). Same fully-closed-to-Staff shape as
 * trainers/expenses (D9: Gym Staff has no AI access at all, so it has no
 * reason to touch this table either) — no SELECT policy for GYM_STAFF,
 * no app_is_platform_admin() branch.
 */
describe("ai_usage_counters isolation", () => {
  let owner: Pool;
  let app: Pool;
  let gymA: SeededGym;
  let gymB: SeededGym;
  let adminA: SeededUser;
  let staffA: SeededUser;
  let platformAdmin: SeededUser;
  let counterId: string;

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
    gymB = await seedGym(owner, "Gym B");
    adminA = await seedUser(owner, "admin-a@test.local");
    staffA = await seedUser(owner, "staff-a@test.local");
    platformAdmin = await seedUser(owner, "platform-admin@test.local");
    await seedMembership(owner, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" });
    await seedMembership(owner, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" });
    await seedMembership(owner, { userId: platformAdmin.id, gymId: null, role: "PLATFORM_ADMIN" });
    const counter = await seedAiUsageCounter(owner, { gymId: gymA.id, date: new Date(), count: 1 });
    counterId = counter.id;
  });

  it("Gym Admin can read own-gym usage counters", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM ai_usage_counters"),
    );
    expect(result.rows.map((r) => r.id)).toEqual([counterId]);
  });

  it("Gym Staff gets ZERO rows, even within their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) => client.query("SELECT id FROM ai_usage_counters"),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("cannot read another gym's usage counters", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymB.id, role: "GYM_ADMIN" },
      (client) => client.query("SELECT id FROM ai_usage_counters WHERE id = $1", [counterId]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("Gym Admin CAN insert/upsert a counter in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) =>
        client.query(
          "INSERT INTO ai_usage_counters (gym_id, date, count) VALUES ($1, now() + interval '1 day', 1)",
          [gymA.id],
        ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Staff CANNOT insert a counter (blocked by RLS)", async () => {
    await expect(
      withRawContext(app, { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" }, (client) =>
        client.query(
          "INSERT INTO ai_usage_counters (gym_id, date, count) VALUES ($1, now() + interval '1 day', 1)",
          [gymA.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot insert a counter into another gym", async () => {
    await expect(
      withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
        client.query(
          "INSERT INTO ai_usage_counters (gym_id, date, count) VALUES ($1, now() + interval '1 day', 1)",
          [gymB.id],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("Gym Admin CAN update a counter in their own gym", async () => {
    const result = await withRawContext(
      app,
      { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" },
      (client) => client.query("UPDATE ai_usage_counters SET count = count + 1 WHERE id = $1", [counterId]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("Gym Staff CANNOT update a counter", async () => {
    const result = await withRawContext(
      app,
      { userId: staffA.id, gymId: gymA.id, role: "GYM_STAFF" },
      (client) => client.query("UPDATE ai_usage_counters SET count = count + 1 WHERE id = $1", [counterId]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("app_user has NO DELETE privilege on ai_usage_counters at all", async () => {
    await expect(
      withRawContext(app, { userId: adminA.id, gymId: gymA.id, role: "GYM_ADMIN" }, (client) =>
        client.query("DELETE FROM ai_usage_counters WHERE id = $1", [counterId]),
      ),
    ).rejects.toThrow(/permission denied for table ai_usage_counters/i);
  });

  it("Platform Admin gets zero rows from ai_usage_counters (no RLS bypass)", async () => {
    const result = await withRawContext(
      app,
      { userId: platformAdmin.id, role: "PLATFORM_ADMIN" },
      (client) => client.query("SELECT id FROM ai_usage_counters"),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("cross-tenant UPDATE cannot affect another gym's counter", async () => {
    const adminB = await seedUser(owner, "admin-b@test.local");
    await seedMembership(owner, { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" });

    const result = await withRawContext(
      app,
      { userId: adminB.id, gymId: gymB.id, role: "GYM_ADMIN" },
      (client) => client.query("UPDATE ai_usage_counters SET count = count + 1 WHERE id = $1", [counterId]),
    );
    expect(result.rowCount).toBe(0);
  });
});
