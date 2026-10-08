import type { Language } from "../types";
import type { CountDocument } from "./chart-documents";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";

export function SampleCorrelationPlot({
  data,
  language,
}: {
  data: CountDocument;
  language: Language;
}) {
  const zh = language === "zh";
  if (!data.samples.length) return null;
  const labels = data.samples.map((row) => row.column);
  return (
    <section>
      <InteractivePlot
        language={language}
        height={360}
        title={
          zh
            ? "样本一致性 · logCPM Pearson"
            : "Sample consistency · logCPM Pearson"
        }
        data={[
          {
            type: "heatmap",
            x: labels,
            y: labels,
            z: data.correlation_logcpm_pearson.map((row, i) =>
              row.map((value, j) =>
                data.correlation_available[i][j] ? value : null,
              ),
            ),
            zmin: -1,
            zmax: 1,
            colorscale: [
              [0, "#ce738c"],
              [0.5, "#f6f7fb"],
              [1, "#6668d5"],
            ],
            hoverongaps: false,
            colorbar: { title: { text: "Pearson r" }, thickness: 10 },
            hovertemplate: "%{y} / %{x}<br>r = %{z:.4f}<extra></extra>",
          },
        ]}
        layout={{
          plot_bgcolor: "#e8edf4",
          margin: { l: 96, r: 52, t: 14, b: 85 },
          xaxis: { automargin: true },
          yaxis: { autorange: "reversed", automargin: true },
        }}
      />
      <p className="field-help">
        {zh
          ? "灰色：无法计算相关性；零表示已计算且为零。"
          : "Gray: correlation unavailable. Zero indicates a calculated zero correlation."}
      </p>
    </section>
  );
}
