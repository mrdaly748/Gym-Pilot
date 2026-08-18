import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The installed Prisma version's config type (@prisma/config, see
// node_modules/@prisma/config/dist/index.d.ts) only supports `url` and
// `shadowDatabaseUrl` here — no `directUrl` field (that's a newer Prisma
// config API than what's actually installed; verified against the real
// type, not assumed from documentation).
//
// The Prisma CLI (this file) always connects as the migration-owner role,
// via DIRECT_URL (non-pooled). The app's runtime Prisma client
// (lib/server/db.ts, @prisma/adapter-pg) reads DATABASE_URL directly and
// independently of this file — prisma.config.ts only affects CLI commands
// (generate, migrate), never the running application. DATABASE_URL is the
// pooled connection, connected as the least-privilege `app_user` role
// (docs/architecture.md §5.3a) — deliberately never used for migrations.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
