/**
 * Chart value formatting lives here, in the client-chart layer, precisely
 * so Server Component pages (Dashboard/Analytics) never need to pass a
 * function prop across the Server → Client boundary — only this
 * serializable `format` kind. No business logic here: callers already
 * convert millimes to TND before building chart points (same as every
 * other money display in the app); this only decides the display suffix.
 */
export type ChartValueFormat = "tnd" | "count";

export function formatChartValue(value: number, format: ChartValueFormat): string {
  const rounded = Math.round(value);
  if (format === "tnd") {
    return rounded.toLocaleString() + " TND";
  }
  return String(rounded);
}
