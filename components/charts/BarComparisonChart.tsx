"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarPoint = { label: string; value: number };

/**
 * Categorical comparison chart (e.g. revenue by plan) — same dark-surface
 * styling as TrendAreaChart, a single accent-colored series, no stacking,
 * no second axis.
 */
export function BarComparisonChart({
  data,
  valueFormatter,
  color = "var(--accent)",
  height = 220,
}: {
  data: BarPoint[];
  valueFormatter: (value: number) => string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          cursor={{ fill: "var(--surface-3)" }}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
