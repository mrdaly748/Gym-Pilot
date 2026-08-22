import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Next.js nests loading.tsx as the Suspense fallback for its own segment
 * AND every nested route below it that doesn't provide a more specific
 * loading.tsx of its own — so this file is the fallback for gym home
 * itself, and also for every simpler list page (members, memberships,
 * payments, attendance, trainers, expenses, staff) that has no dedicated
 * one. Kept deliberately generic (header + a few card-shaped blocks + one
 * larger content block) rather than mirroring gym home's specific hero
 * layout, so it's a reasonable approximation everywhere it's used, not a
 * mismatched flash on an unrelated page. dashboard/, analytics/, and
 * members/[memberId]/ each have their own more specific loading.tsx that
 * takes precedence for those routes.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-40" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>

      <div className="mt-6">
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}
