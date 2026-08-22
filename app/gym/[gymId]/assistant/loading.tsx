import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Shown while the Assistant page's auth check resolves. Mirrors PageHeader
 * (including its description line, since this is the one page that uses
 * one) + Chat's own bordered message area and input bar.
 */
export default function Loading() {
  return (
    <main className="p-6 md:p-8">
      <div className="mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-7 w-28" />
        <Skeleton className="mt-1 h-4 w-full max-w-md" />
      </div>

      <div className="mt-6 flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-100" />
        <Skeleton className="h-11" />
      </div>
    </main>
  );
}
