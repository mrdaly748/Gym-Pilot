export type BadgeStatus =
  | "active"
  | "expiring-soon"
  | "expired"
  | "frozen"
  | "cancelled"
  | "archived"
  | "suspended"
  | "disabled";

const STATUS_STYLES: Record<BadgeStatus, string> = {
  active: "bg-success-bg text-success-text",
  "expiring-soon": "bg-warning-bg text-warning-text",
  expired: "bg-surface-3 text-text-secondary",
  frozen: "bg-warning-bg text-warning-text",
  cancelled: "bg-surface-3 text-text-secondary",
  archived: "bg-surface-3 text-text-secondary",
  suspended: "bg-danger-bg text-danger-text",
  disabled: "bg-danger-bg text-danger-text",
};

const STATUS_LABEL: Record<BadgeStatus, string> = {
  active: "Active",
  "expiring-soon": "Expiring soon",
  expired: "Expired",
  frozen: "Frozen",
  cancelled: "Cancelled",
  archived: "Archived",
  suspended: "Suspended",
  disabled: "Disabled",
};

/**
 * Status communicated by color + label, never color alone (WCAG) — the
 * label text is always rendered, color is reinforcement.
 */
export function Badge({ status, children }: { status: BadgeStatus; children?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}
