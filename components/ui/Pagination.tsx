import Link from "next/link";

const LINK_CLASS =
  "rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3";
const DISABLED_CLASS =
  "rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-sm font-medium text-text-tertiary cursor-not-allowed";

/**
 * Simple page-number Previous/Next control (security audit finding M2) —
 * no page-number list, no jump-to-page input, matching the "smallest
 * production-safe approach" this MVP's list sizes call for. Renders nothing
 * when there's only one page, so it's invisible on every gym below the
 * page-size threshold (the overwhelming majority in MVP, per
 * docs/product-spec.md §21's "hundreds to low thousands" scale assumption).
 */
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
      {page > 1 ? (
        <Link href={`${basePath}?page=${page - 1}`} className={LINK_CLASS}>
          Previous
        </Link>
      ) : (
        <span className={DISABLED_CLASS} aria-disabled="true">
          Previous
        </span>
      )}
      <span className="text-sm text-text-tertiary">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`${basePath}?page=${page + 1}`} className={LINK_CLASS}>
          Next
        </Link>
      ) : (
        <span className={DISABLED_CLASS} aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
