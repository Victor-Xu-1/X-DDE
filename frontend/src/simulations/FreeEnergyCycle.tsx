import type { Language } from "../types";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { FreeEnergyEdge } from "./types";

/** Native thermodynamic legs and reported difference; never estimate missing results. */
export function FreeEnergyCycle({
  edge,
  language,
  onLeg,
}: {
  edge: FreeEnergyEdge;
  language: Language;
  onLeg(leg: "complex" | "solvent"): void;
}) {
  if (!edge.legs) return null;
  const zh = language === "zh";
  const rows = [
    {
      label: zh ? "结合复合物 ΔG" : "Bound complex ΔG",
      value: edge.legs.complex.delta_g_kcal_mol,
      uncertainty: edge.legs.complex.uncertainty_kcal_mol,
      leg: "complex" as const,
    },
    {
      label: zh ? "水溶液 ΔG" : "Solvent ΔG",
      value: edge.legs.solvent.delta_g_kcal_mol,
      uncertainty: edge.legs.solvent.uncertainty_kcal_mol,
      leg: "solvent" as const,
    },
    ...(edge.delta_delta_g_kcal_mol != null && edge.uncertainty_kcal_mol != null
      ? [
          {
            label: zh ? "结合变化 ΔΔG" : "Binding change ΔΔG",
            value: edge.delta_delta_g_kcal_mol,
            uncertainty: edge.uncertainty_kcal_mol,
            leg: null,
          },
        ]
      : []),
  ];
  return (
    <div className="fep-cycle">
      <InteractivePlot
        title={zh ? "热力学循环" : "Thermodynamic cycle"}
        language={language}
        height={310}
        data={[
          {
            type: "scatter",
            mode: "markers",
            x: rows.map((row) => row.value),
            y: rows.map((row) => row.label),
            customdata: rows.map((row) => row.uncertainty),
            marker: { size: 9, color: ["#5865d8", "#b773ab", "#18998b"] },
            error_x: {
              type: "data",
              array: rows.map((row) => row.uncertainty),
              visible: true,
              thickness: 1.8,
              width: 5,
              color: "#526079",
            },
            hovertemplate:
              "%{y}<br>%{x:.3f} ± %{customdata:.3f} kcal/mol<extra></extra>",
          },
        ]}
        layout={{
          showlegend: false,
          margin: { l: 145, r: 18, t: 16, b: 55 },
          xaxis: {
            title: {
              text: zh
                ? "自由能变化（kcal/mol）"
                : "Free-energy change (kcal/mol)",
            },
            zeroline: true,
            zerolinecolor: "#aab2c9",
          },
          yaxis: { autorange: "reversed" },
        }}
        onPoint={(point) => {
          const leg = rows[point.pointIndex]?.leg;
          if (leg) onLeg(leg);
        }}
      />
      <p className="field-help">
        {zh
          ? "ΔΔG = 复合物 ΔG − 溶液 ΔG；负值更有利于 B。误差保留计算报告值。点击环境行查看该环境的采样。"
          : "ΔΔG = complex ΔG − solvent ΔG; negative favors B. Error bars retain reported uncertainty. Select a leg to inspect its sampling."}
      </p>
    </div>
  );
}
