import { useState } from "react";
import type { Language } from "../types";
import type { SeriesRow } from "./chart-documents";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import { cyclePairs, seriesMap } from "./series-map";

export function SeriesEnrichmentPlot({
  series,
  language,
  totalSeries,
}: {
  series: SeriesRow[];
  language: Language;
  totalSeries?: number;
}) {
  const zh = language === "zh",
    pairs = cyclePairs(series);
  const [chosen, setChosen] = useState(""),
    [logarithmic, setLogarithmic] = useState(true);
  const pair = pairs.includes(chosen) ? chosen : pairs[0];
  if (!pair)
    return (
      <p className="dataset-empty">
        {zh
          ? "此结果没有双砌块组合；请在成员表中查看已有系列。"
          : "This result has no disynthon pairs. Inspect the available series in the member table."}
      </p>
    );
  let map: ReturnType<typeof seriesMap>;
  try {
    map = seriesMap(series, pair, logarithmic);
  } catch {
    return (
      <p role="alert">
        {zh
          ? "组合记录不唯一，请核对原始周期与系列表。"
          : "Combination records are ambiguous. Check the original cycles and series table."}
      </p>
    );
  }
  const cycles = pair.split(":").map(Number);
  return (
    <section className="dataset-series-map">
      <div className="dataset-map-controls">
        {pairs.length > 1 && (
          <label>
            {zh ? "库周期" : "Library cycles"}
            <select value={pair} onChange={(e) => setChosen(e.target.value)}>
              {pairs.map((value) => (
                <option key={value} value={value}>
                  {value === "reported"
                    ? zh
                      ? "已报告组合"
                      : "Reported combinations"
                    : value
                        .split(":")
                        .map((n) => Number(n) + 1)
                        .join(" × ")}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {zh ? "颜色刻度" : "Color scale"}
          <select
            value={logarithmic ? "log" : "linear"}
            onChange={(e) => setLogarithmic(e.target.value === "log")}
          >
            <option value="log">log₂(1 + {zh ? "富集" : "enrichment"})</option>
            <option value="linear">{zh ? "原始富集" : "Raw enrichment"}</option>
          </select>
        </label>
      </div>
      <InteractivePlot
        language={language}
        height={370}
        title={zh ? "双砌块富集热图" : "Disynthon enrichment heatmap"}
        data={[
          {
            type: "heatmap",
            x: map.b,
            y: map.a,
            z: map.z,
            text: map.cells.map((row) =>
              row.map((cell) =>
                cell
                  ? `${zh ? "富集" : "Enrichment"}: ${cell.score.toPrecision(4)}<br>${zh ? "观察成员" : "Observed members"}: ${cell.members}<br>${zh ? "计数后验区间" : "Count posterior interval"}: ${cell.lower ?? (zh ? "未报告" : "not reported")} – ${cell.upper ?? (zh ? "未报告" : "not reported")}`
                  : zh
                    ? "此视图未报告"
                    : "Not reported in this view",
              ),
            ),
            colorscale: [
              [0, "#edf5f8"],
              [0.45, "#71bcce"],
              [1, "#7462c4"],
            ],
            zmin: 0,
            hoverongaps: false,
            colorbar: {
              title: { text: logarithmic ? "log₂(1+E)" : "Enrichment" },
              thickness: 10,
            },
            hovertemplate: "%{y} / %{x}<br>%{text}<extra></extra>",
          },
        ]}
        layout={{
          plot_bgcolor: "#e8edf4",
          margin: { l: 96, r: 60, t: 12, b: 82 },
          xaxis: {
            title: {
              text:
                pair === "reported"
                  ? zh
                    ? "砌块 B"
                    : "Block B"
                  : (zh ? "周期 " : "Cycle ") + (cycles[1] + 1),
            },
            automargin: true,
          },
          yaxis: {
            title: {
              text:
                pair === "reported"
                  ? zh
                    ? "砌块 A"
                    : "Block A"
                  : (zh ? "周期 " : "Cycle ") + (cycles[0] + 1),
            },
            autorange: "reversed",
            automargin: true,
          },
        }}
      />
      <p className="field-help">
        {zh
          ? "灰色：未出现在此视图，不推断为未观察。悬停查看原始富集与成员数。"
          : "Gray: absent from this view; it is not inferred to be unobserved. Hover for raw enrichment and member counts."}
        {totalSeries !== undefined && totalSeries > series.length
          ? ` ${series.length} / ${totalSeries} ${zh ? "项系列；完整数据可在系列表中查看。" : "series; inspect the series table for the full data."}`
          : ""}
      </p>
    </section>
  );
}
