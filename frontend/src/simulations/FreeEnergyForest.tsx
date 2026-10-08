import { useRef } from "react";
import { exportSvg } from "../presentation/visual-export";
import type { Language } from "../types";
import type { FreeEnergyEdge } from "./types";

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
  const ref = useRef<SVGSVGElement>(null),
    zh = language === "zh";
  const rows = edges.filter(
    (e) => e.delta_delta_g_kcal_mol != null && e.uncertainty_kcal_mol != null,
  );
  if (!rows.length) return null;
  const extent =
    Math.max(
      1,
      ...rows.map(
        (e) => Math.abs(e.delta_delta_g_kcal_mol!) + e.uncertainty_kcal_mol!,
      ),
    ) * 1.1;
  const x = (v: number) => 320 + (v / extent) * 170;
  const height = rows.length * 36 + 70;
  return (
    <section className="fep-forest simulation-plot">
      <header>
        <h3>
          {zh ? "结合自由能变化与误差" : "Binding changes and uncertainty"}
        </h3>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            ref.current && exportSvg(ref.current, "FEP-free-energies")
          }
        >
          SVG ↓
        </button>
      </header>
      <svg
        ref={ref}
        viewBox={`0 0 540 ${height}`}
        role="img"
        aria-label="Relative binding free energies with uncertainty"
      >
        <title>ΔΔG with statistical uncertainty, kcal/mol</title>
        <line
          x1="320"
          x2="320"
          y1="12"
          y2={height - 40}
          stroke="#aab2c9"
          strokeDasharray="4 4"
        />
        {rows.map((e, i) => {
          const y = 28 + i * 36,
            v = e.delta_delta_g_kcal_mol!,
            error = e.uncertainty_kcal_mol!;
          return (
            <g
              key={e.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(e.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(e.id);
                }
              }}
              aria-label={`${e.a} to ${e.b}: ${v} ± ${error} kcal/mol`}
            >
              <text x="8" y={y + 4}>
                {e.a} → {e.b}
              </text>
              <line
                x1={x(v - error)}
                x2={x(v + error)}
                y1={y}
                y2={y}
                stroke="#5865d8"
                strokeWidth="2"
              />
              <line
                x1={x(v - error)}
                x2={x(v - error)}
                y1={y - 5}
                y2={y + 5}
                stroke="#5865d8"
              />
              <line
                x1={x(v + error)}
                x2={x(v + error)}
                y1={y - 5}
                y2={y + 5}
                stroke="#5865d8"
              />
              <circle
                cx={x(v)}
                cy={y}
                r={e.id === selected ? 6 : 4}
                fill={e.id === selected ? "#18998b" : "#5865d8"}
              />
              <title>
                {v.toFixed(2)} ± {error.toFixed(2)} kcal/mol
              </title>
            </g>
          );
        })}
        {[-extent, 0, extent].map((v) => (
          <text key={v} x={x(v)} y={height - 20} textAnchor="middle">
            {v.toFixed(1)}
          </text>
        ))}
        <text x="320" y={height - 3} textAnchor="middle">
          ΔΔG (kcal/mol)
        </text>
      </svg>
      <p className="field-help">
        {zh
          ? "负值表示 B 相对 A 更有利；误差线不是实验置信区间。"
          : "Negative favors B over A. Error bars describe simulation uncertainty, not experimental confidence intervals."}
      </p>
    </section>
  );
}
