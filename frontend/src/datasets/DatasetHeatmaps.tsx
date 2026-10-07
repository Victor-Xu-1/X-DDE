import type { Language } from "../types";
import type { CountDocument, SeriesRow } from "./chart-documents";
import { PlotFrame } from "./PlotFrame";

export function SampleCorrelationPlot({
  data,
  language,
}: {
  data: CountDocument;
  language: Language;
}) {
  const zh = language === "zh",
    samples = data.samples;
  if (!samples.length) return null;
  return (
    <PlotFrame
      language={language}
      title={
        zh
          ? "样本一致性 · logCPM Pearson"
          : "Sample consistency · logCPM Pearson"
      }
    >
      {data.correlation_logcpm_pearson.map((row, i) =>
        row.map((value, j) => {
          const size = 230 / samples.length,
            available = data.correlation_available[i][j];
          return (
            <rect
              key={`${i}-${j}`}
              x={145 + j * size}
              y={20 + i * size}
              width={size}
              height={size}
              fill={
                available
                  ? `hsl(${value >= 0 ? 245 : 18} 65% ${95 - Math.abs(value) * 43}%)`
                  : "#e2e8f0"
              }
            >
              <title>
                {samples[i].column} / {samples[j].column}:{" "}
                {available ? value.toFixed(3) : zh ? "无法计算" : "unavailable"}
              </title>
            </rect>
          );
        }),
      )}
      {samples.slice(0, 16).map((row, index) => (
        <text
          key={row.column}
          x={137}
          y={20 + ((index + 0.6) * 230) / samples.length}
          textAnchor="end"
          fontSize={10}
          fill="#526174"
        >
          {row.column}
        </text>
      ))}
      <text x={260} y={290} textAnchor="middle" fontSize={12} fill="#526174">
        {zh ? "灰色：无法计算相关性" : "Gray: correlation unavailable"}
      </text>
    </PlotFrame>
  );
}

export function SeriesEnrichmentPlot({
  series,
  language,
}: {
  series: SeriesRow[];
  language: Language;
}) {
  const zh = language === "zh",
    rows = series.filter((row) => row.kind === "di").slice(0, 400);
  const a = [...new Set(rows.map((row) => row.block_a))].slice(0, 20),
    b = [...new Set(rows.map((row) => row.block_b))].slice(0, 20);
  if (!rows.length)
    return (
      <p className="dataset-empty">
        {zh
          ? "此结果没有双砌块组合；请在成员表中查看已有系列。"
          : "This result has no disynthon pairs. Inspect the available series in the member table."}
      </p>
    );
  return (
    <PlotFrame
      language={language}
      title={zh ? "双砌块富集热图" : "Disynthon enrichment heatmap"}
    >
      {a.flatMap((blockA, i) =>
        b.map((blockB, j) => {
          const row = rows.find(
              (entry) => entry.block_a === blockA && entry.block_b === blockB,
            ),
            width = 460 / b.length,
            height = 225 / a.length;
          return (
            <rect
              key={`${blockA}-${blockB}`}
              x={120 + j * width}
              y={20 + i * height}
              width={width}
              height={height}
              fill={
                row
                  ? `hsl(${row.score > 1 ? 247 : 185} 68% ${95 - Math.min(8, Math.log2(Math.max(row.score, 0.01) + 1)) * 7}%)`
                  : "#edf1f6"
              }
              stroke="white"
              strokeWidth={1}
            >
              <title>
                {blockA}/{blockB}:{" "}
                {row
                  ? `${row.score.toFixed(3)}; ${row.members} ${zh ? "观察成员" : "observed members"}`
                  : zh
                    ? "未观察"
                    : "unobserved"}
              </title>
            </rect>
          );
        }),
      )}
      {a.map((name, i) => (
        <text
          key={name}
          x={112}
          y={20 + ((i + 0.7) * 225) / a.length}
          textAnchor="end"
          fontSize={10}
          fill="#526174"
        >
          {name}
        </text>
      ))}
      {b.map((name, i) => (
        <text
          key={name}
          x={120 + ((i + 0.5) * 460) / b.length}
          y={265}
          textAnchor="middle"
          fontSize={10}
          fill="#526174"
        >
          {name}
        </text>
      ))}
      <text x={325} y={301} textAnchor="middle" fontSize={12} fill="#526174">
        {zh ? "未观察组合留空" : "Unobserved combinations are left empty"}
      </text>
    </PlotFrame>
  );
}
