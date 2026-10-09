import "./metric-scatter.css";
import { useState } from "react";
import type { Language } from "../types";
import { InteractivePlot } from "./plots/InteractivePlot";
import type { ChartTrace } from "./plots/types";
import {
  identityRange,
  metricPoints,
  plotText,
  type PlotMetric,
} from "./metric-scatter-model";
export type { PlotMetric } from "./metric-scatter-model";

export function MetricScatter<T>({
  rows,
  metrics,
  language,
  label,
  rowId,
  rowLabel,
  selected,
  onSelect,
  identity = false,
}: {
  rows: readonly T[];
  metrics: readonly PlotMetric<T>[];
  language: Language;
  label: string;
  rowId(row: T): string;
  rowLabel(row: T): string;
  selected?: string | null;
  onSelect?(row: T): void;
  identity?: boolean;
}) {
  const zh = language === "zh";
  const [xKey, setX] = useState(metrics[0]?.key),
    [yKey, setY] = useState(metrics[1]?.key);
  const x = metrics.find((metric) => metric.key === xKey) ?? metrics[0];
  const y = metrics.find((metric) => metric.key === yKey) ?? metrics[1];
  if (!x || !y || rows.length < 2) return null;
  const points = metricPoints(rows, x, y);
  const current = points.find((point) => rowId(point.row) === selected);
  const range = identity ? identityRange(points) : null;
  const data: ChartTrace[] = [
    {
      type: "scatter",
      mode: "markers",
      name: label,
      x: points.map((point) => point.x),
      y: points.map((point) => point.y),
      customdata: points.map((point) => plotText(rowLabel(point.row))),
      marker: {
        size: points.map((point) => (rowId(point.row) === selected ? 8 : 5)),
        color: points.map((point) =>
          rowId(point.row) === selected ? "#18998b" : "#5865d8",
        ),
        opacity: points.map((point) =>
          rowId(point.row) === selected ? 1 : 0.7,
        ),
        line: { width: 0.8, color: "#ffffff" },
      },
      hovertemplate:
        "%{customdata}<br>" +
        plotText(x.label) +
        ": %{x:.5g}<br>" +
        plotText(y.label) +
        ": %{y:.5g}<extra></extra>",
    },
    ...(range
      ? [
          {
            type: "scatter" as const,
            mode: "lines" as const,
            x: range,
            y: range,
            line: { color: "#8a97af", width: 1.4, dash: "dash" as const },
            hoverinfo: "skip" as const,
          },
        ]
      : []),
  ];
  return (
    <section className="metric-scatter" aria-label={label}>
      <div
        className={
          "scatter-axes" +
          (onSelect && points.length > 0 ? " has-record-choice" : "")
        }
      >
        {[
          { metric: x, select: setX, label: zh ? "横轴" : "X axis" },
          { metric: y, select: setY, label: zh ? "纵轴" : "Y axis" },
        ].map((axis) => (
          <label key={axis.label}>
            {axis.label}
            <select
              value={axis.metric.key}
              title={axis.metric.label}
              onChange={(event) => axis.select(event.target.value)}
            >
              {metrics.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {onSelect && points.length > 0 && (
          <label className="scatter-record-choice">
            {zh ? "查看记录" : "Inspect record"}
            <select
              value={current ? String(current.sourceIndex) : ""}
              onChange={(event) => {
                const point = points.find(
                  (value) => String(value.sourceIndex) === event.target.value,
                );
                if (point) onSelect(point.row);
              }}
            >
              <option value="">
                {zh ? "选择一个数据点" : "Choose a point"}
              </option>
              {points.map((point) => (
                <option
                  key={point.sourceIndex}
                  value={String(point.sourceIndex)}
                >
                  {rowLabel(point.row)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="scatter-record-count">
        {points.length} / {rows.length}{" "}
        {zh ? "条记录有完整坐标" : "records with both values"}
      </p>
      {points.length ? (
        <InteractivePlot
          title={label}
          data={data}
          language={language}
          height={290}
          layout={{
            // Switching units must reset a prior zoom; selecting another row keeps it.
            // https://plotly.com/javascript/uirevision/
            uirevision: x.key + "|" + y.key,
            showlegend: false,
            xaxis: {
              title: { text: plotText(x.label) },
              automargin: true,
              ...(range ? { range } : {}),
            },
            yaxis: {
              title: { text: plotText(y.label) },
              automargin: true,
              ...(range
                ? {
                    range,
                    matches: "x",
                  }
                : {}),
            },
          }}
          onPoint={
            onSelect
              ? (point) => {
                  if (point.curveNumber !== 0) return;
                  const source = points[point.pointIndex];
                  if (source) onSelect(source.row);
                }
              : undefined
          }
        />
      ) : (
        <p role="status">
          {zh
            ? "这两个指标没有可比较的完整数值。"
            : "No complete value pairs for these metrics."}
        </p>
      )}
      {identity && points.length > 0 && (
        <p className="field-help">
          {zh
            ? "虚线为实验值与预测值相等的位置，两轴使用相同数值范围；不代表模型已验证。"
            : "Dashed line: observed equals predicted, with matching axis ranges. This does not establish model validity."}
        </p>
      )}
    </section>
  );
}
