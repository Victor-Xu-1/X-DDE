import { useState } from "react";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { OverlapHeatmap } from "./OverlapHeatmap";
import type { Language } from "../types";
import type { FreeEnergyEdge } from "./types";
import { SimulationPlot } from "./SimulationPlot";
import { FreeEnergyCycle } from "./FreeEnergyCycle";
import { ResearchTable } from "../presentation/ResearchTable";

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
      <dl className="simulation-readouts">
        <div>
          <dt>{zh ? "当前环境 ΔG" : "Selected-leg ΔG"}</dt>
          <dd>
            {result.delta_g_kcal_mol.toFixed(2)} <small>kcal/mol</small>
          </dd>
        </div>
        <div>
          <dt>{zh ? "统计误差" : "Statistical uncertainty"}</dt>
          <dd>
            ± {result.uncertainty_kcal_mol.toFixed(2)} <small>kcal/mol</small>
          </dd>
        </div>
        <div>
          <dt>{zh ? "重复间波动" : "Between-repeat spread"}</dt>
          <dd>
            {result.repeat_spread_kcal_mol == null ? (
              <small>{zh ? "未报告" : "Not reported"}</small>
            ) : (
              <>
                {result.repeat_spread_kcal_mol.toFixed(2)}{" "}
                <small>kcal/mol</small>
              </>
            )}
          </dd>
        </div>
      </dl>
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
            id: "cycle",
            label: zh ? "双环境比较" : "Thermodynamic cycle",
            content: (
              <FreeEnergyCycle
                edge={edge}
                language={language}
                onLeg={(selected) => {
                  setLeg(selected);
                  setRepeat(0);
                }}
              />
            ),
          },
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
                      error: convergence.forward_error[i],
                    })),
                  },
                  {
                    label: zh ? "反向" : "Reverse",
                    color: "#18998b",
                    points: convergence.fractions.map((x, i) => ({
                      x,
                      y: convergence.reverse[i],
                      error: convergence.reverse_error[i],
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
          {
            id: "repeats",
            label: zh ? "重复结果" : "Independent estimates",
            content: (
              <ResearchTable
                rows={result.individual.map((value, index) => ({
                  ...value,
                  repeat: index + 1,
                }))}
                title={
                  zh
                    ? "当前环境的独立估计"
                    : "Independent estimates for selected leg"
                }
                language={language}
                rowId={(row) => String(row.repeat)}
                selected={String(repeat + 1)}
                onSelect={(row) => setRepeat(row.repeat - 1)}
                exportName={`fep-${leg}-repeats.csv`}
                columns={[
                  {
                    key: "repeat",
                    label: zh ? "重复" : "Repeat",
                    value: (row) => row.repeat,
                    numeric: true,
                  },
                  {
                    key: "delta",
                    label: "ΔG (kcal/mol)",
                    value: (row) => row.delta_g,
                    numeric: true,
                  },
                  {
                    key: "uncertainty",
                    label: zh
                      ? "MBAR 误差（kcal/mol）"
                      : "MBAR uncertainty (kcal/mol)",
                    value: (row) => row.mbar_error,
                    numeric: true,
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
