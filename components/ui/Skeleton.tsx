/**
 * Minimal pulsing placeholder block, sized via className (e.g. "h-24" for a
 * stat-card-shaped block, "h-4 w-32" for a text line). Used to compose
 * page-specific loading.tsx skeletons that roughly mirror each page's real
 * layout — no spinner, no new dependency (animate-pulse is a built-in
 * Tailwind utility).
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-3 ${className}`} />;
}
