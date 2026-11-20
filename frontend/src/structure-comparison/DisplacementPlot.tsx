import { useSyncExternalStore } from "react";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";
import { addressLabel, type Displacement } from "./types";

const shortDesktop = "(1180px <= width <= 1440px) and (max-height: 840px)";
const compactPlot = () => window.matchMedia?.(shortDesktop).matches ?? false;
function observePlotSize(onChange: () => void) {
  const media = window.matchMedia?.(shortDesktop);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

export function DisplacementPlot({
  rows,
  language,
  onSelect,
}: {
  rows: Displacement[];
  language: Language;
  onSelect(row: Displacement): void;
}) {
  const zh = language === "zh";
  const compact = useSyncExternalStore(observePlotSize, compactPlot);
  return (
    <InteractivePlot
      language={language}
      height={compact ? 208 : 280}
      title={
        zh
          ? "同一坐标系中的逐残基位移"
          : "Per-residue displacement in the fitted frame"
      }
      data={(["target", "partner"] as const).map((role, index) => {
        const selected = rows
          .map((row, i) => ({ row, i }))
          .filter(({ row }) => row.role === role);
        return {
          type: "scatter" as const,
          mode: "markers" as const,
          name:
            role === "target"
              ? zh
                ? "靶蛋白"
                : "Target"
              : zh
                ? "伙伴"
                : "Partner",
          x: selected.map(({ i }) => i + 1),
          y: selected.map(({ row }) => row.displacement_angstrom),
          customdata: selected.map(({ i }) => i),
          text: selected.map(
            ({ row }) =>
              `${addressLabel(row.reference)} → ${addressLabel(row.moving)}`,
          ),
          marker: { color: index ? "#b77329" : "#4168ad", size: 4 },
          hovertemplate: "%{text}<br>%{y:.3f} Å<extra>%{fullData.name}</extra>",
        };
      })}
      layout={{
        ...(compact
          ? {
              margin: { l: 51, r: 10, t: 30, b: 48 },
              legend: {
                orientation: "h",
                x: 0,
                y: 1.02,
                yanchor: "bottom",
                font: { size: 10 },
              },
            }
          : {}),
        xaxis: {
          title: { text: zh ? "匹配 Cα 的顺序" : "Matched Cα index" },
          zeroline: false,
        },
        yaxis: {
          title: { text: zh ? "位移（Å）" : "Displacement (Å)" },
          rangemode: "tozero",
        },
      }}
      onPoint={(point) => {
        const index = Number(point.customdata);
        if (Number.isInteger(index) && index >= 0 && index < rows.length)
          onSelect(rows[index]);
      }}
    />
  );
}
