import Link from "next/link";

/**
 * Application-level 404 (Next.js App Router convention). This is only the
 * shared fallback UI — it does not replace or run instead of any existing
 * notFound() call (member detail, member edit, trainer edit, plan edit):
 * those call sites are unchanged, they now just render into this themed
 * page instead of Next's unstyled default, exactly as intended.
 *
 * No gymId/role context is reliably available here (this renders for any
 * unmatched route, not just ones nested under an authenticated area), so
 * the only universally safe destination is the public landing page — same
 * reasoning app/error.tsx uses for its own "Go home" action. Styled with
 * Button's own primary-variant classes rather than importing Button
 * itself, since Button always renders a <button> (form-submit semantics,
 * requires "use client"), not an <a> — a plain server-rendered Link needs
 * no client JS here.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-text-secondary">
        The page or resource you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-lg bg-accent-strong px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-strong-hover"
      >
        Go home
      </Link>
    </div>
  );
}
