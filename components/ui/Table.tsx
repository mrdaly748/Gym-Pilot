import type { ReactNode } from "react";

/**
 * Same underlying <table> semantics every screen already uses (real
 * <table>/<tr>/<th>/<td>, nothing div-based) — just centralized styling.
 * Wrapped in an overflow-x-auto container so wide tables scroll on narrow
 * viewports instead of breaking the page layout (Phase 9.5 responsive pass).
 * Header row sits on surface-1 (matches the nav) so it reads as a distinct
 * band above the surface-2 body — one step of hierarchy, not a color shift
 * per column.
 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full min-w-max bg-surface-2 text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-1">{children}</thead>;
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-foreground ${className}`}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-border-subtle hover:bg-surface-3/60">{children}</tr>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-secondary">
        {children}
      </td>
    </tr>
  );
}
