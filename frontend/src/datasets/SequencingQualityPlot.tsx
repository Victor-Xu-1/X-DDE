import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";

export function SequencingQualityPlot({
  values,
  language,
}: {
  values: number[];
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <InteractivePlot
      title={zh ? "各位置测序质量" : "Sequencing quality by position"}
      language={language}
      data={[
        {
          type: "scatter",
          mode: "lines+markers",
          x: values.map((_, i) => i + 1),
          y: values,
          line: { color: "#2494ad", width: 2.4 },
          marker: { size: 4 },
          hovertemplate: "%{x} · %{y:.3f} Phred<extra></extra>",
        },
      ]}
      layout={{
        showlegend: false,
        xaxis: {
          title: { text: zh ? "读段位置（碱基）" : "Read position (base)" },
        },
        yaxis: {
          title: { text: zh ? "平均 Phred 质量" : "Mean Phred quality" },
          rangemode: "tozero",
        },
      }}
    />
  );
}
