import { useEffect, useState } from "react";
import { Bars, PlotFrame } from "./PlotFrame";
import { ModelValidationPlot } from "./ModelValidationPlot";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";

export function DatasetCharts({
  job,
  result,
  language,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
}) {
  const zh = language === "zh",
    [documents, setDocuments] = useState<Record<string, any>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController(),
      roles = new Set([
        "sequencing_quality",
        "count_quality",
        "barcode_quality",
        "del_series_visualization",
        "independent_holdout_evaluation",
        "research_model_application",
      ]);
    void Promise.all(
      result.artifacts
        .filter((file) => file.format === "json" && roles.has(file.role))
        .map(async (file) => {
          const response = await fetch(artifactUrl(job.id, file.name), {
            signal: c.signal,
          });
          if (!response.ok)
            throw new Error("Research chart data is unavailable.");
          return [file.role, await response.json()] as const;
        }),
    )
      .then((entries) => {
        if (!c.signal.aborted) setDocuments(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [job.id, result]);
  const sequencing = documents.sequencing_quality,
    count = documents.count_quality,
    barcode = documents.barcode_quality,
    series = documents.del_series_visualization,
    model =
      documents.independent_holdout_evaluation ??
      documents.research_model_application;
  const correlations = count?.correlation_logcpm_pearson as
      number[][] | undefined,
    samples = count?.samples as { column: string; depth: number }[] | undefined;
  const modelPoints = model?.heldout_predictions as
    { observed: number; predicted: number }[] | undefined;
  const seriesRows = series?.series
    ?.filter((row: { kind: string }) => row.kind === "di")
    .slice(0, 400) as
    | { block_a: string; block_b: string; score: number; members: number }[]
    | undefined;
  const a = seriesRows
      ? [...new Set(seriesRows.map((row) => row.block_a))].slice(0, 20)
      : [],
    b = seriesRows
      ? [...new Set(seriesRows.map((row) => row.block_b))].slice(0, 20)
      : [];
  return (
    <div className="dataset-chart-grid">
      {sequencing && (
        <>
          <Bars
            language={language}
            title={zh ? "读段质量与解码" : "Read quality and decoding"}
            rows={[
              { name: zh ? "输入读段" : "Input", value: sequencing.reads },
              { name: zh ? "完成解码" : "Decoded", value: sequencing.decoded },
              {
                name: zh ? "未解码" : "Rejected",
                value: sequencing.reads - sequencing.decoded,
              },
            ]}
          />
          <PlotFrame
            language={language}
            title={zh ? "各位置测序质量" : "Sequencing quality by position"}
          >
            <line x1={60} x2={605} y1={265} y2={265} stroke="#cbd5e1" />
            <polyline
              fill="none"
              stroke="#288dbc"
              strokeWidth={2.8}
              points={sequencing.mean_quality
                .map(
                  (value: number, index: number) =>
                    `${60 + (index / Math.max(1, sequencing.mean_quality.length - 1)) * 540},${265 - (Math.min(value, 45) / 45) * 215}`,
                )
                .join(" ")}
            />
            <text
              x={325}
              y={307}
              textAnchor="middle"
              fill="#526174"
              fontSize={12}
            >
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
              Phred+33
            </text>
          </PlotFrame>
        </>
      )}
      {samples && (
        <Bars
          language={language}
          title={zh ? "样本测序深度" : "Sample sequencing depth"}
          rows={samples.map((row) => ({ name: row.column, value: row.depth }))}
        />
      )}
      {correlations && samples && (
        <PlotFrame
          language={language}
          title={
            zh
              ? "样本一致性 · logCPM Pearson"
              : "Sample consistency · logCPM Pearson"
          }
        >
          {correlations.map((row, i) =>
            row.map((value, j) => {
              const size = 230 / correlations.length;
              return (
                <rect
                  key={`${i}-${j}`}
                  x={145 + j * size}
                  y={20 + i * size}
                  width={size}
                  height={size}
                  fill={
                    count.correlation_available[i][j]
                      ? `hsl(${value >= 0 ? 245 : 18} 65% ${95 - Math.abs(value) * 43}%)`
                      : "#e2e8f0"
                  }
                >
                  <title>
                    {samples[i].column} / {samples[j].column}:{" "}
                    {count.correlation_available[i][j]
                      ? value.toFixed(3)
                      : "unavailable"}
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
          <text
            x={260}
            y={290}
            textAnchor="middle"
            fontSize={12}
            fill="#526174"
          >
            {zh ? "灰色：无法计算相关性" : "Gray: correlation unavailable"}
          </text>
        </PlotFrame>
      )}
      {barcode && (
        <Bars
          language={language}
          title={zh ? "砌块与编码覆盖" : "Building-block and barcode coverage"}
          rows={barcode.cycles.map((row: { set: string; members: number }) => ({
            name: row.set,
            value: row.members,
          }))}
        />
      )}
      {seriesRows && (
        <PlotFrame
          language={language}
          title={zh ? "双砌块富集热图" : "Disynthon enrichment heatmap"}
        >
          {a.flatMap((blockA, i) =>
            b.map((blockB, j) => {
              const row = seriesRows.find(
                  (row) => row.block_a === blockA && row.block_b === blockB,
                ),
                width = 460 / Math.max(1, b.length),
                height = 225 / Math.max(1, a.length);
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
                      ? `${row.score.toFixed(3)}; ${row.members} observed members`
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
              y={20 + ((i + 0.7) * 225) / Math.max(1, a.length)}
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
              x={120 + ((i + 0.5) * 460) / Math.max(1, b.length)}
              y={265}
              textAnchor="middle"
              fontSize={10}
              fill="#526174"
            >
              {name}
            </text>
          ))}
          <text
            x={325}
            y={301}
            textAnchor="middle"
            fontSize={12}
            fill="#526174"
          >
            {zh
              ? "未观察组合留空，不补造计数"
              : "Unobserved combinations are left empty"}
          </text>
        </PlotFrame>
      )}
      {modelPoints && (
        <ModelValidationPlot
          points={modelPoints}
          metrics={result.metrics}
          language={language}
          application={Boolean(documents.research_model_application)}
        />
      )}
      {!sequencing && !count && !barcode && !series && !model && (
        <Bars
          language={language}
          title={zh ? "计算结果概览" : "Calculation overview"}
          rows={Object.entries(result.counts)
            .slice(0, 8)
            .map(([name, value]) => ({ name, value }))}
        />
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
