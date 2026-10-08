import { useRef } from "react";
import { exportSvg } from "../presentation/visual-export";
import type { Language } from "../types";
import type { FreeEnergyResult } from "./types";

export function FreeEnergyNetwork({
  result,
  selected,
  onSelect,
  language,
}: {
  result: FreeEnergyResult;
  selected: string;
  onSelect(id: string): void;
  language: Language;
}) {
  const ref = useRef<SVGSVGElement>(null),
    zh = language === "zh";
  const positions = new Map(
    result.nodes.map((node, i) => [
      node.id,
      {
        x:
          270 +
          170 * Math.cos((2 * Math.PI * i) / result.nodes.length - Math.PI / 2),
        y:
          180 +
          125 * Math.sin((2 * Math.PI * i) / result.nodes.length - Math.PI / 2),
      },
    ]),
  );
  const active = result.edges.find((e) => e.id === selected);
  return (
    <section className="fep-network simulation-plot">
      <header>
        <h3>{zh ? "分子变化网络" : "Molecular perturbation network"}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() => ref.current && exportSvg(ref.current, "FEP-network")}
        >
          SVG ↓
        </button>
      </header>
      <svg
        ref={ref}
        viewBox="0 0 540 360"
        role="img"
        aria-label={
          zh
            ? "相对结合自由能变化网络"
            : "Relative binding free-energy perturbation network"
        }
      >
        <title>
          {zh
            ? "点击连接查看对应分子变化"
            : "Select a connection to inspect the molecular change"}
        </title>
        {result.edges.map((edge) => {
          const a = positions.get(edge.a)!,
            b = positions.get(edge.b)!;
          return (
            <g
              key={edge.id}
              role="button"
              tabIndex={0}
              aria-label={`${edge.a} → ${edge.b}`}
              onClick={() => onSelect(edge.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(edge.id);
                }
              }}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={edge.id === selected ? "#18998b" : "#b8c1d9"}
                strokeWidth={edge.id === selected ? 4 : 2}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth="18"
              />
              <title>
                {edge.a} → {edge.b}
                {edge.delta_delta_g_kcal_mol != null
                  ? `: ${edge.delta_delta_g_kcal_mol.toFixed(2)} ± ${edge.uncertainty_kcal_mol?.toFixed(2)} kcal/mol`
                  : ` · ${zh ? "计划" : "Planned"}`}
              </title>
            </g>
          );
        })}
        {result.nodes.map((node) => {
          const p = positions.get(node.id)!;
          return (
            <g
              key={node.id}
              className={
                active && [active.a, active.b].includes(node.id)
                  ? "is-selected"
                  : ""
              }
            >
              <circle cx={p.x} cy={p.y} r="23" />
              <text x={p.x} y={p.y + 4} textAnchor="middle">
                {node.record + 1}
              </text>
              <text x={p.x} y={p.y + 42} textAnchor="middle">
                {node.id}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
