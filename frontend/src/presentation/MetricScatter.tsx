import "./metric-scatter.css";
import { useEffect, useRef, useState } from "react";
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
  const container = useRef<HTMLElement>(null);
  const [plotWidth, setPlotWidth] = useState(480);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => {
      const width = Math.floor(node.getBoundingClientRect().width);
      if (width > 0) setPlotWidth(Math.max(200, width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rows.length, metrics.length]);
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
  const plotLeft = 80,
    plotRight = plotWidth - 32,
    plotSpan = plotRight - plotLeft;
  const ticks = plotWidth < 380 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const px = (v: number) => plotLeft + ((v - xmin) / (xmax - xmin)) * plotSpan,
    py = (v: number) => 218 - ((v - ymin) / (ymax - ymin)) * 185;
  return (
    <section
      ref={container}
      className="metric-scatter result-section-card"
      aria-label={label}
    >
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
          className="metric-scatter-plot"
          viewBox={`0 0 ${plotWidth} 265`}
          width={plotWidth}
          height="265"
          role={onSelect ? "group" : "img"}
          aria-label={x.label + " × " + y.label}
        >
          {ticks.map((fraction) => (
            <g key={fraction}>
              <line
                x1={plotLeft}
                y1={33 + fraction * 185}
                x2={plotRight}
                y2={33 + fraction * 185}
                className="scatter-grid"
              />
              <text x={plotLeft - 8} y={37 + fraction * 185} textAnchor="end">
                {Number((ymax - fraction * (ymax - ymin)).toPrecision(3))}
              </text>
              <text
                x={plotLeft + fraction * plotSpan}
                y="236"
                textAnchor="middle"
              >
                {Number((xmin + fraction * (xmax - xmin)).toPrecision(3))}
              </text>
            </g>
          ))}
          <line
            x1={plotLeft}
            y1="218"
            x2={plotRight}
            y2="218"
            className="scatter-axis"
          />
          <text x={plotLeft + plotSpan / 2} y="259" textAnchor="middle">
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
