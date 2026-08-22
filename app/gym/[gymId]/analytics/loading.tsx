import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while Analytics's several 6-month trend/comparison queries resolve
 * — the heaviest page in the app. Mirrors PageHeader + stat row + the
 * chart grid + the plan-performance table below it.
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
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>

      <div className="mt-8">
        <Skeleton className="h-56" />
      </div>
    </main>
  );
}
