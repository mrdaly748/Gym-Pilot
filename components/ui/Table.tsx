import type { ReactNode } from "react";

/**
 * Same underlying <table> semantics every screen already uses (real
 * <table>/<tr>/<th>/<td>, nothing div-based) — just centralized styling.
 * Wrapped in an overflow-x-auto container so wide tables scroll on narrow
 * viewports instead of breaking the page layout (Phase 9.5 responsive pass).
 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-max text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-gray-900 ${className}`}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className="border-t border-gray-100">{children}</tr>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-500">
        {children}
      </td>
    </tr>
  );
}
