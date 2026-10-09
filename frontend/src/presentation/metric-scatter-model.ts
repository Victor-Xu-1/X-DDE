export interface PlotMetric<T> {
  key: string;
  label: string;
  value(row: T): number | null | undefined;
}

/** Raw signed coordinates and original row identities, without filling missing values. */
export function metricPoints<T>(
  rows: readonly T[],
  x: PlotMetric<T>,
  y: PlotMetric<T>,
) {
  return rows.flatMap((row, sourceIndex) => {
    const xv = x.value(row),
      yv = y.value(row);
    return xv != null &&
      yv != null &&
      Number.isFinite(xv) &&
      Number.isFinite(yv)
      ? [{ row, sourceIndex, x: xv, y: yv }]
      : [];
  });
}

export function identityRange(points: readonly { x: number; y: number }[]) {
  if (!points.length) return null;
  let min = Infinity,
    max = -Infinity;
  for (const point of points) {
    min = Math.min(min, point.x, point.y);
    max = Math.max(max, point.x, point.y);
  }
  const pad = (max - min || Math.abs(min) * 0.1 || 1) * 0.08;
  return [min - pad, max + pad];
}

/** Native chart text accepts markup; source-owned names remain literal. */
export function plotText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
