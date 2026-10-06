import { useRef, type ReactNode } from "react";
import type { Language } from "../types";

export function PlotFrame({
  title,
  language,
  children,
}: {
  title: string;
  language: Language;
  children: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null);
  function download() {
    if (!svg.current) return;
    const clone = svg.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = title + ".svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="dataset-chart">
      <div className="dataset-panel-title">
        <strong>{title}</strong>
        <button type="button" onClick={download}>
          {language === "zh" ? "下载图表" : "Download"}
        </button>
      </div>
      <svg
        ref={svg}
        viewBox="0 0 640 320"
        role="img"
        aria-label={title}
        style={{ background: "white", fontFamily: "Arial,sans-serif" }}
      >
        {children}
      </svg>
    </section>
  );
}
export function Bars({
  rows,
  title,
  language,
}: {
  rows: { name: string; value: number }[];
  title: string;
  language: Language;
}) {
  const visible = rows.slice(0, 25),
    maximum = Math.max(1, ...visible.map((v) => v.value)),
    width = 550 / Math.max(1, visible.length);
  return (
    <PlotFrame title={title} language={language}>
      <line x1={60} x2={610} y1={265} y2={265} stroke="#cbd5e1" />
      {visible.map((row, i) => (
        <g key={row.name}>
          <rect
            x={60 + i * width + width * 0.15}
            y={265 - (row.value / maximum) * 210}
            width={width * 0.65}
            height={(row.value / maximum) * 210}
            fill={i % 2 ? "#7465e6" : "#2c9ac8"}
            rx={3}
          >
            <title>
              {row.name}: {row.value.toLocaleString()}
            </title>
          </rect>
          <text
            x={60 + (i + 0.47) * width}
            y={285}
            textAnchor="middle"
            fontSize={10}
            fill="#526174"
          >
            {row.name.slice(0, 12)}
          </text>
        </g>
      ))}
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line
            x1={60}
            x2={610}
            y1={265 - v * 210}
            y2={265 - v * 210}
            stroke="#e8edf4"
            strokeDasharray="3 5"
          />
          <text
            x={52}
            y={270 - v * 210}
            textAnchor="end"
            fontSize={11}
            fill="#64748b"
          >
            {(maximum * v).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </text>
        </g>
      ))}
    </PlotFrame>
  );
}
