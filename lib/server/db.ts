import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Prisma,
  type MembershipRole,
} from "./generated/prisma-client/client";

// Prisma 7 requires an explicit driver adapter — no bundled query engine.
// Connects via DATABASE_URL (pooled, app_user role). Migrations use
// DIRECT_URL instead, via the Prisma CLI, never through this client.
// See docs/architecture.md §5.6.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}
const adapter = new PrismaPg({ connectionString: databaseUrl });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type TenantContext = {
  userId: string;
  gymId: string;
  role: MembershipRole;
};

/**
 * Three transaction-local Postgres session settings carry trust from the
 * verified request context into RLS policies — not two. See
 * docs/architecture.md §5.3 for why app.current_user_id exists (the
 * gym_memberships bootstrap lookup needs a session setting before gymId is
 * known). There is no app.current_platform setting.
 *
 * Set via `SELECT set_config(name, value, true)` — never
 * `SET LOCAL name = ${value}`, which is not valid parameterized SQL and
 * would require unsafe raw-string interpolation (docs/decisions.md D15).
 */

/**
 * Bootstrap-only: resolves { gymId, role } from gym_memberships before
 * either is known. Only lib/server/services/identity.ts should call this.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/** Used by every tenant-scoped service function. */
export async function withTenant<T>(
  context: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${context.userId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${context.gymId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_role', ${context.role}, true)`;
    return fn(tx);
  });
}

/**
 * Platform Admin only. Never sets a gymId. Only ever used against non-tenant
 * tables/columns (docs/architecture.md §5.2).
 */
export async function withPlatform<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_role', 'PLATFORM_ADMIN', true)`;
    return fn(tx);
  });
}
