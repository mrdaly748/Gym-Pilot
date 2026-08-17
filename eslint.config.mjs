import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Tenant-isolation boundary rule (docs/architecture.md §2, §5):
// only lib/server/services/** (and lib/server/db.ts itself) may import the
// Prisma client. Every other file must go through the service layer so
// gym_id scoping and canonical metric definitions stay in one place.
const noDirectPrismaAccess = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@prisma/client",
            message:
              "Do not import Prisma directly. Add or use a function in lib/server/services/* instead (see docs/architecture.md §2).",
          },
          {
            name: "@/lib/server/db",
            message:
              "lib/server/db is only for use inside lib/server/services/*. Add or use a service function instead.",
          },
        ],
        patterns: [
          {
            group: ["**/lib/server/generated/*", "@/lib/server/generated/*"],
            message:
              "Do not import the generated Prisma client directly. Add or use a function in lib/server/services/* instead (see docs/architecture.md §2).",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/server/services/**", "lib/server/db.ts"],
    ...noDirectPrismaAccess,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
