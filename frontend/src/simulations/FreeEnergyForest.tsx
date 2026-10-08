import type { Language } from "../types";
import type { FreeEnergyEdge } from "./types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";

export function FreeEnergyForest({
  edges,
  selected,
  onSelect,
  language,
}: {
  edges: FreeEnergyEdge[];
  selected: string;
  onSelect(id: string): void;
  language: Language;
}) {
  const rows = edges.filter(
    (e) => e.delta_delta_g_kcal_mol != null && e.uncertainty_kcal_mol != null,
  );
  if (!rows.length) return null;
  return (
    <div className="fep-forest">
      <InteractivePlot
        title={
          language === "zh"
            ? "结合自由能变化与误差"
            : "Binding changes and uncertainty"
        }
        language={language}
        height={Math.max(260, rows.length * 34 + 100)}
        data={[
          {
            type: "scatter",
            mode: "markers",
            x: rows.map((e) => e.delta_delta_g_kcal_mol!),
            y: rows.map((e) => e.a + " → " + e.b),
            marker: {
              size: rows.map((e) => (e.id === selected ? 12 : 8)),
              color: rows.map((e) =>
                e.id === selected ? "#18998b" : "#5865d8",
              ),
            },
            error_x: {
              type: "data",
              array: rows.map((e) => e.uncertainty_kcal_mol!),
              visible: true,
              color: "#5865d8",
            },
            hovertemplate: "%{y}<br>ΔΔG: %{x:.3f} kcal/mol<extra></extra>",
          },
        ]}
        layout={{
          margin: { l: 150, r: 24, t: 20, b: 55 },
          showlegend: false,
          xaxis: {
            title: { text: "ΔΔG (kcal/mol)" },
            zerolinecolor: "#aab2c9",
          },
          yaxis: { autorange: "reversed" },
        }}
        onPoint={(point) => {
          const row = rows[point.pointIndex];
          if (row) onSelect(row.id);
        }}
      />
      <p className="field-help">
        {language === "zh"
          ? "负值表示 B 相对 A 更有利；误差线不是实验置信区间。"
          : "Negative favors B over A. Error bars describe simulation uncertainty, not experimental confidence intervals."}
      </p>
    </div>
  );
}
