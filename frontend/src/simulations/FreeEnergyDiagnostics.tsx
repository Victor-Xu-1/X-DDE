import { useRef, useState } from "react";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { exportSvg } from "../presentation/visual-export";
import type { Language } from "../types";
import type { FreeEnergyEdge } from "./types";
import { SimulationPlot } from "./SimulationPlot";

function OverlapHeatmap({
  matrix,
  language,
}: {
  matrix: number[][];
  language: Language;
}) {
  const ref = useRef<SVGSVGElement>(null),
    zh = language === "zh",
    n = matrix.length,
    size = 320 / n;
  return (
    <section className="fep-heatmap simulation-plot">
      <header>
        <h3>{zh ? "采样重叠" : "Sampling overlap"}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() => ref.current && exportSvg(ref.current, "MBAR-overlap")}
        >
          SVG ↓
        </button>
      </header>
      <svg
        ref={ref}
        viewBox="0 0 390 390"
        role="img"
        aria-label="MBAR overlap matrix"
      >
        <title>MBAR overlap matrix</title>
        {matrix.map((row, i) =>
          row.map((p, j) => (
            <rect
              key={`${i}:${j}`}
              x={48 + j * size}
              y={22 + i * size}
              width={size}
              height={size}
              fill={`rgb(${Math.round(245 - p * 180)} ${Math.round(248 - p * 164)} ${Math.round(255 - p * 59)})`}
            >
              <title>
                λ {i} → λ {j}: {p.toPrecision(4)}
              </title>
            </rect>
          )),
        )}
        {matrix.map((_, i) => (
          <g key={i}>
            <text x={48 + (i + 0.5) * size} y="360" textAnchor="middle">
              {i}
            </text>
            <text x="34" y={22 + (i + 0.5) * size + 4} textAnchor="end">
              {i}
            </text>
          </g>
        ))}
        <text x="208" y="383" textAnchor="middle">
          λ state
        </text>
      </svg>
      <p className="field-help">
        {zh
          ? "深色表示重叠较高；相邻状态重叠过低需要增加采样或调整方案。"
          : "Darker cells indicate more overlap. Low adjacent-state overlap requires further sampling or protocol review."}
      </p>
    </section>
  );
}
export function FreeEnergyDiagnostics({
  edge,
  language,
}: {
  edge: FreeEnergyEdge;
  language: Language;
}) {
  const zh = language === "zh",
    [leg, setLeg] = useState<"complex" | "solvent">("complex"),
    [repeat, setRepeat] = useState(0);
  const result = edge.legs?.[leg],
    convergence = result?.convergence[repeat];
  if (!result)
    return (
      <p>
        {zh
          ? "执行 FEP 后显示采样重叠与收敛曲线。"
          : "Sampling overlap and convergence become available after FEP execution."}
      </p>
    );
  return (
    <section>
      <div className="simulation-condition-row">
        <label>
          {zh ? "环境" : "Thermodynamic leg"}
          <select
            value={leg}
            onChange={(e) => {
              setLeg(e.target.value as "complex" | "solvent");
              setRepeat(0);
            }}
          >
            <option value="complex">
              {zh ? "结合复合物" : "Bound complex"}
            </option>
            <option value="solvent">{zh ? "水溶液" : "Solvent"}</option>
          </select>
        </label>
        <label>
          {zh ? "独立重复" : "Independent repeat"}
          <select
            value={repeat}
            onChange={(e) => setRepeat(Number(e.target.value))}
          >
            {result.individual.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ResearchTabs
        label={zh ? "FEP 采样诊断" : "FEP sampling diagnostics"}
        tabs={[
          {
            id: "overlap",
            label: zh ? "重叠热图" : "Overlap heatmap",
            content: (
              <OverlapHeatmap
                matrix={result.overlap[repeat]}
                language={language}
              />
            ),
          },
          {
            id: "convergence",
            label: zh ? "收敛曲线" : "Convergence",
            content: convergence ? (
              <SimulationPlot
                title={zh ? "前向与反向估计" : "Forward and reverse estimates"}
                xLabel={zh ? "采样比例" : "Sample fraction"}
                yLabel="ΔG (kcal/mol)"
                language={language}
                series={[
                  {
                    label: zh ? "前向" : "Forward",
                    color: "#5865d8",
                    points: convergence.fractions.map((x, i) => ({
                      x,
                      y: convergence.forward[i],
                    })),
                  },
                  {
                    label: zh ? "反向" : "Reverse",
                    color: "#18998b",
                    points: convergence.fractions.map((x, i) => ({
                      x,
                      y: convergence.reverse[i],
                    })),
                  },
                ]}
              />
            ) : (
              <p role="status">
                {zh
                  ? "独立采样不足，无法生成收敛分析；应延长模拟。"
                  : "Insufficient independent samples for convergence analysis; extend the simulation."}
              </p>
            ),
          },
        ]}
      />
    </section>
  );
}
