import { useState } from "react";
import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { ChartTrace } from "../presentation/plots/types";
import { betterScore, type OptimizationData } from "./optimization-model";

export function OptimizationFigures({
  data,
  language,
  selected,
  onSelect,
}: {
  data: OptimizationData;
  language: Language;
  selected: number | null;
  onSelect(record: number): void;
}) {
  const zh = language === "zh";
  const [view, setView] = useState<"candidates" | "rounds">("candidates");
  const objective = data.objective.toUpperCase();
  let retained = data.initial;
  const cumulative = data.history.map((round) => {
    if (
      round.best !== null &&
      betterScore(data.objective, round.best, retained)
    )
      retained = round.best;
    return retained;
  });
  const traces: ChartTrace[] =
    view === "candidates"
      ? [
          {
            type: "scatter",
            mode: "markers",
            name: zh ? "生成候选" : "Generated candidates",
            x: data.candidates.map((row) => row.qed),
            y: data.candidates.map((row) => row.sa),
            customdata: data.candidates.map((row) => row.record),
            text: data.candidates.map((row) =>
              zh
                ? `候选 ${row.record + 1} · 第 ${row.round} 轮`
                : `Candidate ${row.record + 1} · Round ${row.round}`,
            ),
            marker: {
              size: data.candidates.map((row) =>
                row.record === selected ? 9 : 6,
              ),
              color: data.candidates.map((row) =>
                row.round % 2 ? "#5865d8" : "#18998b",
              ),
              line: { color: "#fff", width: 0.8 },
            },
            hovertemplate:
              "%{text}<br>QED: %{x:.4f}<br>SA: %{y:.4f}<extra></extra>",
          },
        ]
      : [
          {
            type: "scatter",
            mode: "lines+markers",
            name: zh ? "每轮最佳" : "Best in each round",
            x: data.history.map((row) => row.round),
            y: data.history.map((row) => row.best),
            connectgaps: false,
            line: { color: "#5865d8", width: 2.4 },
            marker: { size: 6 },
          },
          {
            type: "scatter",
            mode: "lines+markers",
            name: zh
              ? "累计保留最佳（含起始分子）"
              : "Retained best (includes input)",
            x: [0, ...data.history.map((row) => row.round)],
            y: [data.initial, ...cumulative],
            line: { color: "#18998b", width: 2.4 },
            marker: { size: 5 },
          },
        ];
  const baseline =
    view === "rounds" || data.objective === "sa"
      ? {
          type: "line" as const,
          xref: "paper" as const,
          yref: "y" as const,
          x0: 0,
          x1: 1,
          y0: data.initial,
          y1: data.initial,
        }
      : {
          type: "line" as const,
          xref: "x" as const,
          yref: "paper" as const,
          x0: data.initial,
          x1: data.initial,
          y0: 0,
          y1: 1,
        };
  return (
    <section
      className="optimization-figures"
      aria-label={zh ? "优化比较图" : "Optimization comparison"}
    >
      <div
        className="optimization-chart-switch"
        role="group"
        aria-label={zh ? "优化图视图" : "Optimization chart view"}
      >
        {(["candidates", "rounds"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "candidates"
              ? zh
                ? "QED 与 SA"
                : "QED and SA"
              : zh
                ? "逐轮变化"
                : "Round history"}
          </button>
        ))}
      </div>
      {view === "candidates" && (
        <label className="field optimization-record-choice">
          {zh ? "查看候选" : "Inspect candidate"}
          <select
            value={selected ?? ""}
            onChange={(event) => {
              const record = Number(event.target.value);
              if (
                event.target.value !== "" &&
                data.candidates.some((row) => row.record === record)
              )
                onSelect(record);
            }}
          >
            <option value="">{zh ? "选择候选" : "Choose a candidate"}</option>
            {data.candidates.map((row) => (
              <option key={row.record} value={row.record}>
                {zh ? "候选" : "Candidate"} {row.record + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      <InteractivePlot
        key={view}
        title={
          view === "candidates"
            ? zh
              ? "候选的描述符取舍"
              : "Candidate descriptor trade-offs"
            : zh
              ? "实际每轮结果与累计最佳"
              : "Observed round results and retained best"
        }
        data={traces}
        language={language}
        height={280}
        layout={{
          xaxis: {
            title: {
              text:
                view === "candidates"
                  ? "QED ↑"
                  : zh
                    ? "已完成轮次"
                    : "Completed round",
            },
            ...(view === "rounds" ? { dtick: 1 } : { range: [0, 1] }),
          },
          yaxis: {
            title: { text: view === "candidates" ? "SA ↓" : objective },
          },
          shapes: [
            {
              ...baseline,
              line: { color: "#8793aa", width: 1.2, dash: "dash" },
            },
          ],
        }}
        onPoint={
          view === "candidates"
            ? (point) => {
                if (
                  point.curveNumber === 0 &&
                  typeof point.customdata === "number" &&
                  data.candidates.some((row) => row.record === point.customdata)
                )
                  onSelect(point.customdata);
              }
            : undefined
        }
      />
      <p className="field-help">
        {zh
          ? `虚线为起始 ${objective}。每轮分数可能下降，累计最佳同时保留起始分子。`
          : `The dashed line marks starting ${objective}. Round winners can worsen; retained best also includes the input.`}
      </p>
    </section>
  );
}
