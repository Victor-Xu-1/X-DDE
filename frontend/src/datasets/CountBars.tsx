import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";

/** Every supplied count remains in the plot; labels and values are never silently truncated. */
export function Bars({
  rows,
  title,
  language,
}: {
  rows: { name: string; value: number }[];
  title: string;
  language: Language;
}) {
  return (
    <InteractivePlot
      title={title}
      language={language}
      height={Math.max(280, Math.min(640, rows.length * 26 + 80))}
      data={[
        {
          type: "bar",
          orientation: "h",
          x: rows.map((row) => row.value),
          y: rows.map((row) => row.name),
          marker: {
            color: rows.map((_, i) => (i % 2 ? "#7465e6" : "#229db1")),
          },
          hovertemplate: "%{y}<br>%{x:,}<extra></extra>",
        },
      ]}
      layout={{
        showlegend: false,
        margin: { l: 110, r: 18, t: 12, b: 44 },
        xaxis: {
          title: { text: language === "zh" ? "数量" : "Count" },
          rangemode: "tozero",
        },
        yaxis: { autorange: "reversed", automargin: true },
      }}
    />
  );
}
