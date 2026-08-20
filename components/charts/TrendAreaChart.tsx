"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { label: string; value: number };

/**
 * The one chart type shared by Dashboard and Analytics for time-series
 * data (Phase 9.5). Styled to sit on the dark GymPilot surfaces: subtle
 * gridlines, muted axis text, a single accent-colored line with a soft
 * gradient fill underneath — no second axis, no extra series, no
 * decorative effects. `color` defaults to the brand accent; callers pass
 * a different semantic token only when the data itself has a different
 * meaning (e.g. attendance vs. revenue).
 */
export function TrendAreaChart({
  data,
  valueFormatter,
  color = "var(--accent)",
  height = 220,
}: {
  data: TrendPoint[];
  valueFormatter: (value: number) => string;
  color?: string;
  height?: number;
}) {
  const gradientId = `trend-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis
          dataKey="label"
          stroke="var(--text-tertiary)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--text-tertiary)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={valueFormatter}
        />
        <Tooltip
          formatter={(value) => valueFormatter(Number(value))}
          contentStyle={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--foreground)",
          }}
          labelStyle={{ color: "var(--text-secondary)" }}
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
