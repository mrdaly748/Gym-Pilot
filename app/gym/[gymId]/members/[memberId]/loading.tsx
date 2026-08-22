import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while the member detail page's parallel fetches (memberships,
 * payments, check-ins, plus the outstanding-balance computation) resolve.
 * Mirrors PageHeader + the info card + the stat row + the three history
 * tables below.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-7 w-56" />
      </div>

      <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="mt-2 h-4 w-full max-w-sm" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      <div className="mt-8 space-y-8">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </main>
  );
}
