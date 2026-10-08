import type { Data } from "plotly.js";
import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";

export interface PlotSeries {
  label: string;
  color: string;
  points: { x: number; y: number; error?: number }[];
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
  const valid = series.map((s) => ({
    ...s,
    points: s.points.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  }));
  if (!valid.some((s) => s.points.length))
    return (
      <section>
        <h3>{title}</h3>
        <p>
          {language === "zh" ? "暂无可用采样数据" : "No sampled data available"}
        </p>
      </section>
    );
  const data: Data[] = valid.map((s) => ({
    type: "scatter",
    mode: "lines+markers",
    name: s.label,
    x: s.points.map((p) => p.x),
    y: s.points.map((p) => p.y),
    line: { color: s.color, width: 2.4 },
    marker: { color: s.color, size: 4 },
    ...(s.points.some((p) => p.error !== undefined)
      ? {
          error_y: {
            type: "data",
            array: s.points.map((p) => p.error ?? 0),
            visible: true,
          },
        }
      : {}),
    hovertemplate:
      "%{fullData.name}<br>" +
      xLabel +
      ": %{x:.4g}<br>" +
      yLabel +
      ": %{y:.4g}<extra></extra>",
  }));
  return (
    <InteractivePlot
      title={title}
      data={data}
      language={language}
      layout={{
        xaxis: {
          title: { text: xLabel },
          gridcolor: "#edf0f5",
          zeroline: false,
        },
        yaxis: {
          title: { text: yLabel },
          gridcolor: "#edf0f5",
          zeroline: false,
        },
        shapes:
          selectedX === undefined
            ? []
            : [
                {
                  type: "line",
                  xref: "x",
                  yref: "paper",
                  x0: selectedX,
                  x1: selectedX,
                  y0: 0,
                  y1: 1,
                  line: { color: "#18998b", width: 1, dash: "dot" },
                },
              ],
      }}
      onPoint={
        onSelect
          ? (point) => {
              if (typeof point.x === "number") onSelect(point.x);
            }
          : undefined
      }
    />
  );
}
