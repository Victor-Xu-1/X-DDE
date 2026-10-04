import "./metric-scatter.css";
import { useRef, useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import { exportSvg } from "./visual-export";
import type { Language } from "../types";
export interface PlotMetric<T> {
  key: string;
  label: string;
  value(row: T): number | null | undefined;
}
export function MetricScatter<T>({
  rows,
  metrics,
  language,
  label,
  rowId,
  rowLabel,
  selected,
  onSelect,
}: {
  rows: readonly T[];
  metrics: readonly PlotMetric<T>[];
  language: Language;
  label: string;
  rowId(row: T): string;
  rowLabel(row: T): string;
  selected?: string | null;
  onSelect?(row: T): void;
}) {
  const zh = language === "zh",
    [xKey, setX] = useState(metrics[0]?.key),
    [yKey, setY] = useState(metrics[1]?.key);
  const plot = useRef<SVGSVGElement>(null);
  const x = metrics.find((m) => m.key === xKey) ?? metrics[0],
    y = metrics.find((m) => m.key === yKey) ?? metrics[1];
  if (!x || !y || rows.length < 2) return null;
  const points = rows.flatMap((row) => {
    const xv = x.value(row),
      yv = y.value(row);
    return xv != null &&
      yv != null &&
      Number.isFinite(xv) &&
      Number.isFinite(yv)
      ? [{ row, x: xv, y: yv }]
      : [];
  });
  function range(values: number[]) {
    const lo = Math.min(...values),
      hi = Math.max(...values),
      pad = (hi - lo || Math.abs(lo) * 0.1 || 1) * 0.08;
    return [lo - pad, hi + pad];
  }
  const [xmin, xmax] = range(points.map((p) => p.x)),
    [ymin, ymax] = range(points.map((p) => p.y));
  const px = (v: number) => 58 + ((v - xmin) / (xmax - xmin)) * 390,
    py = (v: number) => 218 - ((v - ymin) / (ymax - ymin)) * 185;
  return (
    <section className="metric-scatter result-section-card" aria-label={label}>
      <header>
        <h3>{label}</h3>
        <span>
          {points.length} / {rows.length}
        </span>
        <button
          type="button"
          className="visual-export-button"
          aria-label={zh ? "下载当前图表 SVG" : "Download current chart SVG"}
          onClick={() => {
            if (plot.current) exportSvg(plot.current, label);
          }}
        >
          <DownloadOutlined /> SVG
        </button>
      </header>
      <div className="scatter-axes">
        <label>
          {zh ? "横轴" : "X axis"}
          <select value={x.key} onChange={(e) => setX(e.target.value)}>
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {zh ? "纵轴" : "Y axis"}
          <select value={y.key} onChange={(e) => setY(e.target.value)}>
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {points.length ? (
        <svg
          ref={plot}
          viewBox="0 0 480 265"
          role={onSelect ? "group" : "img"}
          aria-label={x.label + " × " + y.label}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line
                x1="58"
                y1={33 + (i * 185) / 4}
                x2="448"
                y2={33 + (i * 185) / 4}
                className="scatter-grid"
              />
              <text x="50" y={37 + (i * 185) / 4} textAnchor="end">
                {Number((ymax - (i * (ymax - ymin)) / 4).toPrecision(3))}
              </text>
              <text x={58 + (i * 390) / 4} y="236" textAnchor="middle">
                {Number((xmin + (i * (xmax - xmin)) / 4).toPrecision(3))}
              </text>
            </g>
          ))}
          <line x1="58" y1="218" x2="448" y2="218" className="scatter-axis" />
          <text x="253" y="259" textAnchor="middle">
            {x.label}
          </text>
          <text
            x="18"
            y="125"
            textAnchor="middle"
            transform="rotate(-90 18 125)"
          >
            {y.label}
          </text>
          {points.map((p) => (
            <circle
              key={rowId(p.row)}
              cx={px(p.x)}
              cy={py(p.y)}
              r={selected === rowId(p.row) ? 6 : 4}
              className={
                selected === rowId(p.row)
                  ? "scatter-point selected"
                  : "scatter-point"
              }
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={
                rowLabel(p.row) +
                ": " +
                x.label +
                " " +
                p.x +
                "; " +
                y.label +
                " " +
                p.y
              }
              onClick={() => onSelect?.(p.row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(p.row);
                }
              }}
            >
              <title>
                {rowLabel(p.row) +
                  ": " +
                  x.label +
                  " " +
                  p.x +
                  "; " +
                  y.label +
                  " " +
                  p.y}
              </title>
            </circle>
          ))}
        </svg>
      ) : (
        <p className="field-help">
          {zh
            ? "这些记录没有可成对显示的数值。"
            : "No paired finite values for these records."}
        </p>
      )}
    </section>
  );
}
