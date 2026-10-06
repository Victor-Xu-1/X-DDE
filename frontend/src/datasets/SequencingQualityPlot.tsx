import type { Language } from "../types";
import { PlotFrame } from "./PlotFrame";

export function SequencingQualityPlot({
  values,
  language,
}: {
  values: number[];
  language: Language;
}) {
  const zh = language === "zh",
    maximum = Math.max(40, ...values),
    count = values.length;
  return (
    <PlotFrame
      title={zh ? "各位置测序质量" : "Sequencing quality by position"}
      language={language}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
        <g key={ratio}>
          <line
            x1={60}
            x2={605}
            y1={265 - ratio * 215}
            y2={265 - ratio * 215}
            stroke="#e1e7f2"
          />
          <text
            x={52}
            y={270 - ratio * 215}
            textAnchor="end"
            fill="#526174"
            fontSize={11}
          >
            {(ratio * maximum).toFixed(0)}
          </text>
        </g>
      ))}
      <polyline
        fill="none"
        stroke="#288dbc"
        strokeWidth={2.8}
        points={values
          .map(
            (value, index) =>
              `${60 + (index / Math.max(1, count - 1)) * 540},${265 - (value / maximum) * 215}`,
          )
          .join(" ")}
      />
      {[0, 0.5, 1].map((ratio) => (
        <text
          key={ratio}
          x={60 + ratio * 540}
          y={284}
          textAnchor="middle"
          fill="#526174"
          fontSize={11}
        >
          {Math.round(ratio * Math.max(0, count - 1)) + 1}
        </text>
      ))}
      <text x={325} y={310} textAnchor="middle" fill="#526174" fontSize={12}>
        {zh ? "读段位置（碱基）" : "Read position (base)"}
      </text>
      <text
        x={16}
        y={155}
        transform="rotate(-90 16 155)"
        textAnchor="middle"
        fill="#526174"
        fontSize={12}
      >
        {zh ? "平均 Phred 质量" : "Mean Phred quality"}
      </text>
    </PlotFrame>
  );
}
