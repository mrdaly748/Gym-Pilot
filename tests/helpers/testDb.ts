import EmbeddedPg from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * A real, ephemeral, standalone Postgres for DB-backed tests — never the
 * hosted Supabase dev project (docs/decisions.md D18).
 *
 * IMPORTANT DEVIATION FROM THE ARCHITECTURE DOC'S ASSUMPTION: this uses
 * `embedded-postgres` (a genuine native Postgres binary), not Prisma's own
 * local dev database (`npx prisma dev`). During Phase 1 implementation,
 * `prisma dev` was found to NOT enforce real Postgres role-based
 * authentication — every connection is silently treated as the `postgres`
 * superuser regardless of the username/password supplied, which makes it
 * structurally unable to validate app_user's restricted privileges or RLS.
 * (A raw PGlite/pglite-socket connection — the engine prisma dev itself is
 * built on — has the same limitation.) See the Phase 1 completion report
 * for the full finding. CI is unaffected: it already used a genuine
 * `postgres:16` service container per docs/architecture.md §9.
 */

// In CI, a real `postgres:16` service container is already running before
// this file's code executes (docs/architecture.md §9) — configured in
// .github/workflows/ci.yml with the same owner username/password convention
// used locally, differing only by port. Locally, embedded-postgres starts
// its own instance on a fixed high port. `CI=true` is set automatically by
// GitHub Actions; not set in local dev.
const IS_CI = process.env.CI === "true";

const DATA_DIR = path.resolve(process.cwd(), ".tmp-test-pg-data");
const PORT = IS_CI ? 5432 : 55490;
const OWNER_PASSWORD = "test_owner_pw_ephemeral";
export const APP_USER_PASSWORD = "test_app_user_pw_ephemeral";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");
const BOOTSTRAP_SQL_PATH = path.resolve(
  process.cwd(),
  "prisma/sql/bootstrap-app-role.sql",
);

function connectionString(user: string, password: string): string {
  return `postgres://${user}:${password}@localhost:${PORT}/postgres`;
}

export const OWNER_URL = connectionString("postgres", OWNER_PASSWORD);
export const APP_USER_URL = connectionString("app_user", APP_USER_PASSWORD);

// embedded-postgres ships as a CJS default export; interop varies by loader.
type EmbeddedPostgresCtor = new (options: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
}) => {
  initialise: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
const EmbeddedPostgres = (
  EmbeddedPg as unknown as { default?: EmbeddedPostgresCtor }
).default ?? (EmbeddedPg as unknown as EmbeddedPostgresCtor);

let server: InstanceType<EmbeddedPostgresCtor> | undefined;

/**
 * Starts the ephemeral Postgres and applies the full Phase 1 migration
 * sequence: schema migration -> bootstrap-app-role.sql -> RLS migration.
 * This exact order is a real constraint, not arbitrary — bootstrap must run
 * after the tables exist (it GRANTs on them) and before the RLS migration
 * (which GRANTs EXECUTE to app_user, so app_user must already exist). See
 * prisma/sql/bootstrap-app-role.sql's header comment.
 */
export async function startTestDatabase(): Promise<void> {
  if (IS_CI) {
    // The postgres:16 service container in .github/workflows/ci.yml is
    // already up and empty by the time this runs — nothing to start.
  } else {
    // maxRetries/retryDelay: a previous run's postgres process may not have
    // fully released its file handles on the data dir yet on Windows even
    // after exiting — see the comment in stopTestDatabase().
    rmSync(DATA_DIR, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500,
    });

    server = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: "postgres",
      password: OWNER_PASSWORD,
      port: PORT,
      persistent: false,
    });

    await server.initialise();
    await server.start();
  }

  const owner = new Pool({ connectionString: OWNER_URL });
  try {
    const migrationDirs = readdirSync(MIGRATIONS_DIR, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const schemaMigration = migrationDirs.find((name) =>
      name.includes("init_core_tenancy"),
    );
    const rlsMigration = migrationDirs.find((name) =>
      name.includes("rls_core"),
    );
    if (!schemaMigration || !rlsMigration) {
      throw new Error(
        "tests/helpers/testDb.ts expects exactly the init_core_tenancy and " +
          "rls_core migrations to exist. Update this file if migrations changed.",
      );
    }

    await owner.query(
      readFileSync(
        path.join(MIGRATIONS_DIR, schemaMigration, "migration.sql"),
        "utf8",
      ),
    );

    // replaceAll, not replace: the placeholder also appears in the file's
    // header comment (before the actual PASSWORD clause) — a single-match
    // .replace() would silently patch the comment and leave the real
    // CREATE ROLE statement with the literal placeholder string, which is
    // exactly the bug that surfaced as "password authentication failed"
    // when this was first written with .replace().
    const bootstrapSql = readFileSync(BOOTSTRAP_SQL_PATH, "utf8").replaceAll(
      "REPLACE_WITH_STRONG_PASSWORD",
      APP_USER_PASSWORD,
    );
    await owner.query(bootstrapSql);

    await owner.query(
      readFileSync(
        path.join(MIGRATIONS_DIR, rlsMigration, "migration.sql"),
        "utf8",
      ),
    );

    // Any migration after these two foundational ones (e.g. Phase 2+
    // additive schema changes) is applied last, in chronological order.
    // migrationDirs is already sorted, so filtering preserves order.
    const laterMigrations = migrationDirs.filter(
      (name) => name !== schemaMigration && name !== rlsMigration,
    );
    for (const dir of laterMigrations) {
      await owner.query(
        readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"),
      );
    }
  } finally {
    await owner.end();
  }
}

export async function stopTestDatabase(): Promise<void> {
  if (server) {
    // embedded-postgres's Windows teardown (taskkill /pid ... /f /t) has
    // been observed to occasionally not signal process exit promptly,
    // which would otherwise hang this indefinitely and, transitively, the
    // whole `vitest run` process. A local-only reliability quirk — CI never
    // reaches this branch at all (IS_CI skips starting embedded-postgres in
    // the first place, since the postgres:16 service container is managed
    // by GitHub Actions instead). Bounded with a timeout so a slow teardown
    // can never hang the test run; if it fires, a stray postgres process
    // may need manual cleanup (`taskkill /F /IM postgres.exe` on Windows).
    await Promise.race([
      server.stop(),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          console.warn(
            "[testDb] server.stop() did not resolve within 10s; proceeding anyway. " +
              "A stray postgres process may be left running locally.",
          );
          resolve();
        }, 10_000).unref();
      }),
    ]);
    server = undefined;
  }
  rmSync(DATA_DIR, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 500,
  });
}

export function getOwnerPool(): Pool {
  return new Pool({ connectionString: OWNER_URL });
}

export function getAppUserPool(): Pool {
  return new Pool({ connectionString: APP_USER_URL });
}

export async function resetTestData(owner: Pool): Promise<void> {
  await owner.query(
    "TRUNCATE attendance_checkins, payment_adjustments, payments, membership_freezes, memberships, members, membership_plans, gym_memberships, gyms, users RESTART IDENTITY CASCADE",
  );
}

export type GymStatus = "ACTIVE" | "SUSPENDED";
export type SeededGym = { id: string; name: string };
export async function seedGym(
  owner: Pool,
  name: string,
  status: GymStatus = "ACTIVE",
): Promise<SeededGym> {
  const result = await owner.query<SeededGym>(
    "INSERT INTO gyms (name, status) VALUES ($1, $2) RETURNING id, name",
    [name, status],
  );
  return result.rows[0];
}

export type SeededUser = { id: string; email: string };
export async function seedUser(
  owner: Pool,
  email: string,
): Promise<SeededUser> {
  const result = await owner.query<SeededUser>(
    "INSERT INTO users (id, email) VALUES (gen_random_uuid(), $1) RETURNING id, email",
    [email],
  );
  return result.rows[0];
}

export type MembershipRole = "PLATFORM_ADMIN" | "GYM_ADMIN" | "GYM_STAFF";
export type SeededMembership = { id: string };
export async function seedMembership(
  owner: Pool,
  args: {
    userId: string;
    gymId: string | null;
    role: MembershipRole;
    disabledAt?: Date;
  },
): Promise<SeededMembership> {
  const result = await owner.query<SeededMembership>(
    "INSERT INTO gym_memberships (user_id, gym_id, role, disabled_at) VALUES ($1, $2, $3, $4) RETURNING id",
    [args.userId, args.gymId, args.role, args.disabledAt ?? null],
  );
  return result.rows[0];
}

export type SeededMember = { id: string; name: string; phoneNormalized: string };
export async function seedMember(
  owner: Pool,
  args: {
    gymId: string;
    name: string;
    phone: string;
    phoneNormalized: string;
    joinDate?: Date;
    archivedAt?: Date;
  },
): Promise<SeededMember> {
  const result = await owner.query<{
    id: string;
    name: string;
    phone_normalized: string;
  }>(
    `INSERT INTO members (gym_id, name, phone, phone_normalized, join_date, archived_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, phone_normalized`,
    [
      args.gymId,
      args.name,
      args.phone,
      args.phoneNormalized,
      args.joinDate ?? new Date(),
      args.archivedAt ?? null,
    ],
  );
  const row = result.rows[0];
  return { id: row.id, name: row.name, phoneNormalized: row.phone_normalized };
}

export type SeededPlan = { id: string; name: string };
export async function seedPlan(
  owner: Pool,
  args: {
    gymId: string;
    name: string;
    priceMillimes?: number;
    durationDays?: number;
    archivedAt?: Date;
  },
): Promise<SeededPlan> {
  const result = await owner.query<SeededPlan>(
    `INSERT INTO membership_plans (gym_id, name, price_millimes, duration_days, archived_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name`,
    [
      args.gymId,
      args.name,
      args.priceMillimes ?? 50000,
      args.durationDays ?? 30,
      args.archivedAt ?? null,
    ],
  );
  return result.rows[0];
}

export type SeededMembership2 = { id: string; startDate: string; endDate: string };
export async function seedMembershipRecord(
  owner: Pool,
  args: {
    gymId: string;
    memberId: string;
    planId: string;
    planNameSnapshot?: string;
    priceMillimesSnapshot?: number;
    durationDaysSnapshot?: number;
    startDate: Date;
    endDate: Date;
    cancelledAt?: Date;
  },
): Promise<SeededMembership2> {
  const result = await owner.query<{ id: string; start_date: string; end_date: string }>(
    `INSERT INTO memberships
       (gym_id, member_id, plan_id, plan_name_snapshot, price_millimes_snapshot, duration_days_snapshot, start_date, end_date, cancelled_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, start_date, end_date`,
    [
      args.gymId,
      args.memberId,
      args.planId,
      args.planNameSnapshot ?? "Monthly",
      args.priceMillimesSnapshot ?? 50000,
      args.durationDaysSnapshot ?? 30,
      args.startDate,
      args.endDate,
      args.cancelledAt ?? null,
    ],
  );
  const row = result.rows[0];
  return { id: row.id, startDate: row.start_date, endDate: row.end_date };
}

export type SeededFreeze = { id: string };
export async function seedFreeze(
  owner: Pool,
  args: {
    gymId: string;
    membershipId: string;
    frozenAt: Date;
    resumedAt?: Date;
  },
): Promise<SeededFreeze> {
  const result = await owner.query<SeededFreeze>(
    `INSERT INTO membership_freezes (gym_id, membership_id, frozen_at, resumed_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [args.gymId, args.membershipId, args.frozenAt, args.resumedAt ?? null],
  );
  return result.rows[0];
}

export type SeededPayment = { id: string };
export async function seedPayment(
  owner: Pool,
  args: {
    gymId: string;
    membershipId: string;
    amountMillimes: number;
    method?: string;
    paidAt?: Date;
    recordedByUserId: string;
  },
): Promise<SeededPayment> {
  const result = await owner.query<SeededPayment>(
    `INSERT INTO payments (gym_id, membership_id, amount_millimes, method, paid_at, recorded_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      args.gymId,
      args.membershipId,
      args.amountMillimes,
      args.method ?? "cash",
      args.paidAt ?? new Date(),
      args.recordedByUserId,
    ],
  );
  return result.rows[0];
}

export type SeededPaymentAdjustment = { id: string };
export async function seedPaymentAdjustment(
  owner: Pool,
  args: {
    gymId: string;
    paymentId: string;
    amountMillimes: number;
    reason?: string;
    recordedByUserId: string;
  },
): Promise<SeededPaymentAdjustment> {
  const result = await owner.query<SeededPaymentAdjustment>(
    `INSERT INTO payment_adjustments (gym_id, payment_id, amount_millimes, reason, recorded_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [args.gymId, args.paymentId, args.amountMillimes, args.reason ?? null, args.recordedByUserId],
  );
  return result.rows[0];
}

export type SeededCheckin = { id: string };
export async function seedCheckin(
  owner: Pool,
  args: {
    gymId: string;
    memberId: string;
    checkedInAt?: Date;
    recordedByUserId: string;
  },
): Promise<SeededCheckin> {
  const result = await owner.query<SeededCheckin>(
    `INSERT INTO attendance_checkins (gym_id, member_id, checked_in_at, recorded_by_user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [args.gymId, args.memberId, args.checkedInAt ?? new Date(), args.recordedByUserId],
  );
  return result.rows[0];
}

export type RawContext = {
  userId?: string;
  gymId?: string;
  role?: MembershipRole;
};

/**
 * Runs `fn` against a raw app_user connection with the given session
 * context set via set_config(name, value, true) — mirrors
 * lib/server/db.ts's withUser()/withTenant()/withPlatform() exactly, but
 * with zero application code involved, to prove the database layer
 * enforces isolation independently (docs/architecture.md §5.4).
 *
 * Always rolls back at the end. Mutation attempts are checked by their
 * result (rows affected, or a thrown RLS-violation error) from within the
 * still-open transaction — nothing this helper does is ever actually
 * persisted, so tests need no explicit cleanup between probes.
 */
export async function withRawContext<T>(
  pool: Pool,
  context: RawContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (context.userId) {
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [context.userId],
      );
    }
    if (context.gymId) {
      await client.query(
        "SELECT set_config('app.current_gym_id', $1, true)",
        [context.gymId],
      );
    }
    if (context.role) {
      await client.query("SELECT set_config('app.current_role', $1, true)", [
        context.role,
      ]);
    }
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
