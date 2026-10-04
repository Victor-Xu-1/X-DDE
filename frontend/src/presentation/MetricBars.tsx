import { useRef, useState } from "react";
import type { Language } from "../types";
import { exportSvg } from "./visual-export";
import type { PlotMetric } from "./MetricScatter";
/** Native numerical values only; bars retain units and never infer a model score. */
export function MetricBars<T>({
  rows,
  metrics,
  rowLabel,
  language,
  title,
}: {
  rows: readonly T[];
  metrics: readonly PlotMetric<T>[];
  rowLabel(row: T): string;
  language: Language;
  title: string;
}) {
  const zh = language === "zh",
    svg = useRef<SVGSVGElement>(null);
  const [metricKey, setMetric] = useState(metrics[0]?.key);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  if (!metric || !rows.length) return null;
  const values = rows
    .map((row) => ({ row, value: metric.value(row) }))
    .filter(
      (item): item is { row: T; value: number } =>
        typeof item.value === "number" && Number.isFinite(item.value),
    );
  const min = Math.min(0, ...values.map((v) => v.value)),
    max = Math.max(0, ...values.map((v) => v.value)),
    span = max - min || 1;
  const x = (value: number) => 190 + ((value - min) / span) * 320;
  return (
    <section className="result-section-card metric-bars" aria-label={title}>
      <header className="evidence-material-toolbar">
        <h3>{title}</h3>
        <button
          type="button"
          className="visual-export-button"
          onClick={() => {
            if (svg.current) exportSvg(svg.current, title);
          }}
        >
          {zh ? "下载图表 SVG" : "Download chart SVG"}
        </button>
      </header>
      <label>
        {zh ? "显示指标" : "Metric"}{" "}
        <select value={metric.key} onChange={(e) => setMetric(e.target.value)}>
          {metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {values.length ? (
        <div className="contact-network-scroll">
          <svg
            ref={svg}
            viewBox={"0 0 600 " + (values.length * 48 + 56)}
            role="img"
            aria-label={title + " · " + metric.label}
          >
            <text
              x="350"
              y="22"
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted)"
            >
              {metric.label}
            </text>
            {values.map((item, index) => (
              <g key={index}>
                <text
                  x="178"
                  y={52 + index * 48}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--ink)"
                >
                  {rowLabel(item.row)}
                </text>
                <line
                  x1={x(0)}
                  x2={x(0)}
                  y1={33 + index * 48}
                  y2={63 + index * 48}
                  stroke="var(--border)"
                />
                <rect
                  x={Math.min(x(0), x(item.value))}
                  y={36 + index * 48}
                  width={Math.abs(x(item.value) - x(0))}
                  height="24"
                  rx="3"
                  fill={index % 2 ? "#598ab8" : "#408067"}
                />
                <text
                  x="590"
                  y={52 + index * 48}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--ink)"
                >
                  {Number(item.value.toPrecision(6))}
                  <title>{String(item.value)}</title>
                </text>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <p className="field-help">
          {zh ? "没有该指标的有效数值" : "No finite values for this metric"}
        </p>
      )}
    </section>
  );
}
