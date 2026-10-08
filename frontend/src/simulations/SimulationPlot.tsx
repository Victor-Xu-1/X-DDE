import { useRef } from "react";
import { exportSvg } from "../presentation/visual-export";
import type { Language } from "../types";

export interface PlotSeries {
  label: string;
  color: string;
  points: { x: number; y: number }[];
}
export function SimulationPlot({
  title,
  xLabel,
  yLabel,
  series,
  language,
  selectedX,
  onSelect,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  series: PlotSeries[];
  language: Language;
  selectedX?: number;
  onSelect?(x: number): void;
}) {
  const ref = useRef<SVGSVGElement>(null),
    zh = language === "zh";
  const valid = series.map((s) => ({
    ...s,
    points: s.points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  }));
  const all = valid.flatMap((s) => s.points);
  if (!all.length)
    return (
      <section>
        <h3>{title}</h3>
        <p>{zh ? "暂无可用采样数据" : "No sampled data available"}</p>
      </section>
    );
  const xmin = Math.min(...all.map((p) => p.x)),
    xmax = Math.max(...all.map((p) => p.x));
  const low = Math.min(...all.map((p) => p.y)),
    high = Math.max(...all.map((p) => p.y));
  const padding = (high - low || Math.abs(high) * 0.1 || 1) * 0.1;
  const ymin = low - padding,
    ymax = high + padding;
  const px = (x: number) => 66 + ((x - xmin) / (xmax - xmin || 1)) * 466;
  const py = (y: number) => 224 - ((y - ymin) / (ymax - ymin)) * 190;
  return (
    <section className="simulation-plot">
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() => ref.current && exportSvg(ref.current, title)}
          aria-label={`${zh ? "下载" : "Download"} ${title} SVG`}
        >
          SVG ↓
        </button>
      </header>
      <svg
        ref={ref}
        role="img"
        aria-label={`${title}: ${xLabel}, ${yLabel}`}
        viewBox="0 0 560 284"
      >
        <title>{title}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t} className="plot-grid">
            <line x1="66" x2="532" y1={224 - t * 190} y2={224 - t * 190} />
            <text x="58" y={229 - t * 190} textAnchor="end">
              {(ymin + t * (ymax - ymin)).toPrecision(3)}
            </text>
            <text x={66 + t * 466} y="245" textAnchor="middle">
              {(xmin + t * (xmax - xmin)).toPrecision(3)}
            </text>
          </g>
        ))}
        {valid.map((s) => (
          <path
            key={s.label}
            d={s.points
              .map((p, i) => `${i ? "L" : "M"} ${px(p.x)} ${py(p.y)}`)
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth="2.4"
          >
            <title>{s.label}</title>
          </path>
        ))}
        {selectedX != null && (
          <line
            x1={px(selectedX)}
            x2={px(selectedX)}
            y1="26"
            y2="224"
            className="plot-cursor"
          />
        )}
        <text x="295" y="276" textAnchor="middle">
          {xLabel}
        </text>
        <text transform="translate(16 130) rotate(-90)" textAnchor="middle">
          {yLabel}
        </text>
        {onSelect &&
          valid[0].points.map((p) => (
            <circle
              key={p.x}
              cx={px(p.x)}
              cy={py(p.y)}
              r="6"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${p.x.toPrecision(4)} ${xLabel}; ${p.y.toPrecision(4)} ${yLabel}`}
              onClick={() => onSelect(p.x)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.x);
                }
              }}
            >
              <title>
                {p.x.toPrecision(4)} · {p.y.toPrecision(4)}
              </title>
            </circle>
          ))}
      </svg>
      <div className="simulation-legend">
        {valid.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}
