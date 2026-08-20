import Link from "next/link";
import { listGyms } from "@/lib/server/services/platformAdmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Th, Td, Tr, EmptyRow } from "@/components/ui/Table";
import { CheckCircleIcon, GymsIcon, PauseCircleIcon } from "@/components/ui/icons";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// This page now fetches live gym data (it didn't before Phase 9.5's
// overview addition) but reads no dynamic API (no params/searchParams,
// unlike every other data-fetching page in this app) that would otherwise
// signal Next.js to render it dynamically — without this, `next build`
// tries to statically prerender it against a real database connection,
// which fails at build time (found via a genuine build failure, not
// assumed). Forcing dynamic rendering matches reality: this page always
// shows current, live gym counts, never a cached/stale build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Navigation (including logout) lives in the persistent PlatformNav shell
 * rendered by app/platform/layout.tsx (Phase 9.5). This overview reuses
 * listGyms() — the exact same read /platform/gyms already uses — purely
 * aggregated in this page, no new service function or query: total/
 * active/suspended are counts over the already-fetched array, and "recently
 * created" is the first 5 rows of the array, which listGyms() already
 * returns ordered by createdAt desc.
 */
export default async function PlatformHomePage() {
  const gyms = await listGyms();
  const activeCount = gyms.filter((g) => g.status === "ACTIVE").length;
  const suspendedCount = gyms.length - activeCount;
  const recent = gyms.slice(0, 5);

  return (
    <main className="p-6 md:p-8">
      <PageHeader
        title="Platform Admin"
        description="A read-only overview of gym accounts across GymPilot. Manage individual gyms from the Gyms page."
      />

      <section>
        <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
          Overview
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total gyms"
            value={String(gyms.length)}
            icon={<GymsIcon className="h-4.5 w-4.5" />}
            tone="accent"
          />
          <StatCard
            label="Active"
            value={String(activeCount)}
            icon={<CheckCircleIcon className="h-4.5 w-4.5" />}
            tone="success"
          />
          <StatCard
            label="Suspended"
            value={String(suspendedCount)}
            icon={<PauseCircleIcon className="h-4.5 w-4.5" />}
            tone={suspendedCount > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Recently created
          </h2>
          <Link href="/platform/gyms" className="text-xs font-medium text-accent hover:text-accent-strong-hover">
            Manage all gyms →
          </Link>
        </div>
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </Thead>
            <tbody>
              {recent.map((gym) => (
                <Tr key={gym.id}>
                  <Td className="font-medium">{gym.name}</Td>
                  <Td>
                    <Badge status={gym.status === "SUSPENDED" ? "suspended" : "active"} />
                  </Td>
                  <Td className="text-text-secondary">{formatDate(gym.createdAt)}</Td>
                </Tr>
              ))}
              {recent.length === 0 && (
                <EmptyRow colSpan={3}>
                  No gyms yet. Create the first one from the Gyms page.
                </EmptyRow>
              )}
            </tbody>
          </Table>
        </div>
      </section>
    </main>
  );
}
