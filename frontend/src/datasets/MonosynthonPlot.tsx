import { useState } from "react";
import type { Language } from "../types";
import type { SeriesRow } from "./chart-documents";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";

/** Display native aggregated counts and their intervals, never molecular mean scores. */
export function MonosynthonPlot({
  series,
  language,
}: {
  series: SeriesRow[];
  language: Language;
}) {
  const zh = language === "zh";
  const [chosen, setChosen] = useState(""),
    [limit, setLimit] = useState("20");
  const mono = series.filter((row) => row.kind === "mono");
  const cycles = [
    ...new Set(
      mono.map((row) =>
        row.cycle_a === undefined ? "reported" : String(row.cycle_a),
      ),
    ),
  ].sort();
  const cycle = cycles.includes(chosen) ? chosen : cycles[0];
  const rows = mono
    .filter(
      (row) =>
        (row.cycle_a === undefined ? "reported" : String(row.cycle_a)) ===
        cycle,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.block_a.localeCompare(b.block_a, "en", { numeric: true }),
    );
  const shown = limit === "all" ? rows : rows.slice(0, Number(limit));
  if (!shown.length)
    return (
      <p className="dataset-empty">
        {zh
          ? "此图表文件未报告单砌块；请在完整系列表中查看。"
          : "This chart file reports no monosynthons. Inspect the full series table."}
      </p>
    );
  const intervalX = shown.flatMap((row) =>
    row.lower === undefined || row.upper === undefined
      ? []
      : [row.lower, row.upper, null],
  );
  const intervalY = shown.flatMap((row) =>
    row.lower === undefined || row.upper === undefined
      ? []
      : [row.block_a, row.block_a, null],
  );
  return (
    <section>
      <div className="dataset-map-controls">
        <label>
          {zh ? "库周期" : "Library cycle"}
          <select value={cycle} onChange={(e) => setChosen(e.target.value)}>
            {cycles.map((value) => (
              <option key={value} value={value}>
                {value === "reported"
                  ? zh
                    ? "已报告砌块"
                    : "Reported blocks"
                  : `${zh ? "周期" : "Cycle"} ${Number(value) + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          {zh ? "显示数量" : "Display count"}
          <select value={limit} onChange={(e) => setLimit(e.target.value)}>
            <option value="20">{zh ? "前 20 项" : "Top 20"}</option>
            <option value="40">{zh ? "前 40 项" : "Top 40"}</option>
            <option value="all">
              {zh ? "全部已报告砌块" : "All reported blocks"}
            </option>
          </select>
        </label>
      </div>
      <InteractivePlot
        language={language}
        height={Math.min(1000, Math.max(440, shown.length * 19 + 100))}
        title={
          zh
            ? "单砌块富集与计数区间"
            : "Monosynthon enrichment and count intervals"
        }
        data={[
          {
            type: "scatter",
            mode: "lines",
            x: intervalX,
            y: intervalY,
            line: { color: "#a4b1d2", width: 3 },
            hoverinfo: "skip",
            connectgaps: false,
          },
          {
            type: "scatter",
            mode: "markers",
            x: shown.map((row) => row.score),
            y: shown.map((row) => row.block_a),
            marker: { color: "#7462c4", size: 7 },
            text: shown.map(
              (row) =>
                `${zh ? "观察成员" : "Observed members"}: ${row.members}<br>${zh ? "靶点 / 对照计数" : "Target / reference counts"}: ${row.selection ?? "—"} / ${row.reference ?? "—"}<br>${zh ? "计数后验区间" : "Count posterior interval"}: ${row.lower ?? "—"} – ${row.upper ?? "—"}`,
            ),
            hovertemplate:
              "%{y}<br>Enrichment: %{x:.4g}<br>%{text}<extra></extra>",
          },
        ]}
        layout={{
          showlegend: false,
          margin: { l: 76, r: 20, t: 8, b: 54 },
          xaxis: {
            title: { text: zh ? "富集倍数" : "Enrichment" },
            rangemode: "tozero",
            automargin: true,
          },
          yaxis: {
            type: "category",
            categoryorder: "array",
            categoryarray: shown.map((row) => row.block_a),
            autorange: "reversed",
            automargin: true,
          },
          shapes: [
            {
              type: "line",
              x0: 1,
              x1: 1,
              y0: 0,
              y1: 1,
              yref: "paper",
              line: { color: "#9facbf", dash: "dot", width: 1 },
            },
          ],
        }}
      />
      <p className="field-help">
        {shown.length} / {rows.length}{" "}
        {zh
          ? "项已报告砌块。线段是计数模型的后验区间；不是亲和力或生物学重复误差。"
          : "reported blocks. Segments show count-model posterior intervals, not affinity or biological replicate error."}
      </p>
    </section>
  );
}
