import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while Dashboard's parallel data fetches resolve (up to 4-5 metric
 * queries plus a 6-month trend query, per role). Mirrors PageHeader + the
 * stat-card row + the chart/list sections below, without trying to
 * replicate the Admin-vs-Staff branch exactly (unknown at this point).
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}
