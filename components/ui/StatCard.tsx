import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-text-secondary",
  accent: "bg-accent-soft-bg text-accent",
  success: "bg-success-bg text-success-text",
  warning: "bg-warning-bg text-warning-text",
};

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}
          >
            {icon}
          </span>
        )}
        <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
