import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { SampleCountSummary } from "./count-summary";

export function CountEvidencePlot({
  rows,
  language,
}: {
  rows: SampleCountSummary[];
  language: Language;
}) {
  const zh = language === "zh";
  const series = [
    {
      key: "raw" as const,
      label: zh ? "原始读段" : "Raw reads",
      color: "#7593cf",
    },
    {
      key: "unique" as const,
      label: zh ? "唯一 UMI" : "Unique UMIs",
      color: "#6e66d2",
    },
    {
      key: "corrected" as const,
      label: zh ? "校正 UMI" : "Corrected UMIs",
      color: "#239c95",
    },
  ].filter((item) => rows.some((row) => row[item.key] !== null));
  return (
    <section>
      <InteractivePlot
        language={language}
        title={zh ? "样本读段与 UMI" : "Sample reads and UMIs"}
        data={series.map((item) => ({
          type: "bar",
          name: item.label,
          x: rows.map((row) => row.sample),
          y: rows.map((row) => row[item.key]),
          marker: { color: item.color },
          hovertemplate: "%{x}<br>%{fullData.name}: %{y:,}<extra></extra>",
        }))}
        layout={{
          barmode: "group",
          xaxis: { title: { text: zh ? "样本" : "Sample" }, automargin: true },
          yaxis: {
            title: { text: zh ? "原生计数" : "Native count" },
            rangemode: "tozero",
          },
        }}
      />
      <p className="field-help">
        {zh
          ? "使用已核对的原始计数与 UMI 总数；未报告的 UMI 不绘制，不用零替代。计数不代表结合亲和力。"
          : "Uses reconciled native read and UMI totals. Unreported UMIs are not drawn or replaced by zero. Counts are not binding affinity."}
      </p>
    </section>
  );
}
