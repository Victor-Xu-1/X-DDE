import { useState } from "react";
import { artifactUrl } from "../api";
import { BoundPoseComparison } from "./BoundPoseComparison";
import { MoleculeMapPanel } from "./MoleculeMapPanel";
import { ResearchTabs } from "../presentation/ResearchTabs";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Job, Language } from "../types";
import type { FreeEnergyResult } from "./types";
import { FreeEnergyNetwork } from "./FreeEnergyNetwork";
import { FreeEnergyDiagnostics } from "./FreeEnergyDiagnostics";
import { FreeEnergyForest } from "./FreeEnergyForest";
import { SimulationFiles } from "./SimulationFiles";
import { SimulationForm } from "./SimulationForm";
import "./simulations.css";

export function FreeEnergyResults({
  job,
  result,
  language,
  files,
  protein,
  onCreated,
}: {
  job: Job;
  result: FreeEnergyResult;
  language: Language;
  files: Record<string, string>;
  protein?: string | null;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(result.edges[0].id);
  const edge = result.edges.find((e) => e.id === selected) ?? result.edges[0];
  const [continuing, setContinuing] = useState(false);
  if (
    continuing &&
    onCreated &&
    job.request.operation === "binding_free_energy"
  )
    return (
      <section>
        <button
          type="button"
          className="text-button"
          onClick={() => setContinuing(false)}
        >
          {zh ? "返回变化网络" : "Back to perturbation network"}
        </button>
        <SimulationForm
          form="openfe.rbfe"
          language={language}
          onCreated={onCreated}
          initialTask={{
            ...job.request,
            payload: { ...job.request.payload, stage: "calculate" },
            options: { ...job.request.options, device: "cuda" },
          }}
        />
      </section>
    );
  const a = result.nodes.find((n) => n.id === edge.a)!,
    b = result.nodes.find((n) => n.id === edge.b)!;
  return (
    <div className="simulation-results" data-testid="free-energy-results">
      <div className="simulation-result-toolbar">
        <h2>{zh ? "FEP 结合自由能" : "FEP binding free energy"}</h2>
        <span className="status-badge">
          {result.stage === "plan"
            ? zh
              ? "变化网络已规划"
              : "Network planned"
            : zh
              ? "计算结果 · 待科学审查"
              : "Calculated · Scientific review required"}
        </span>
      </div>
      {result.stage === "plan" &&
        onCreated &&
        job.request.operation === "binding_free_energy" && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setContinuing(true)}
          >
            {zh ? "确认并执行 FEP" : "Review and run FEP"}
          </button>
        )}
      <ResearchTabs
        label={zh ? "所选分子变化" : "Selected molecular change"}
        tabs={[
          {
            id: "molecules",
            label: zh ? "变化网络与分子" : "Network and molecules",
            content: (
              <div className="simulation-main-grid">
                <FreeEnergyNetwork
                  result={result}
                  selected={edge.id}
                  onSelect={setSelected}
                  language={language}
                />
                <MoleculeMapPanel
                  job={job}
                  edge={edge}
                  nodes={[a, b]}
                  language={language}
                />
              </div>
            ),
          },
          ...(protein
            ? [
                {
                  id: "structure",
                  label: zh ? "结合姿势" : "Binding poses",
                  content: (
                    <BoundPoseComparison
                      key={edge.id}
                      labels={[a.id, b.id]}
                      sources={[
                        {
                          url: artifactUrl(job.id, protein),
                          format: "pdb",
                          role: "protein",
                        },
                        ...[a, b].map((n) => ({
                          url: artifactUrl(job.id, n.artifact),
                          format: "sdf" as const,
                          role: "ligand" as const,
                          label: n.id,
                        })),
                      ]}
                      language={language}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "diagnostics",
            label: zh ? "采样与收敛" : "Sampling and convergence",
            content: (
              <FreeEnergyDiagnostics
                key={edge.id}
                edge={edge}
                language={language}
              />
            ),
          },
        ]}
      />
      <div
        className={
          result.stage === "calculate" ? "simulation-secondary-grid" : ""
        }
      >
        <ResearchTable
          rows={result.edges}
          language={language}
          title={zh ? "分子变化" : "Molecular changes"}
          selected={edge.id}
          onSelect={(row) => setSelected(row.id)}
          rowId={(row) => row.id}
          exportName="free-energy-edges.csv"
          initialVisibleColumns={
            result.stage === "calculate"
              ? ["change", "delta", "error", "quality"]
              : ["change", "mapping"]
          }
          columns={[
            {
              key: "change",
              label: zh ? "变化" : "Change",
              value: (e) => `${e.a} → ${e.b}`,
            },
            {
              key: "mapping",
              label: zh ? "映射适合度" : "Mapping",
              numeric: true,
              value: (e) => e.mapping_score,
            },
            ...(result.stage === "calculate"
              ? [
                  {
                    key: "delta",
                    label: "ΔΔG (kcal/mol)",
                    numeric: true,
                    value: (e: typeof edge) => e.delta_delta_g_kcal_mol ?? null,
                  },
                  {
                    key: "error",
                    label: zh ? "误差（kcal/mol）" : "Uncertainty (kcal/mol)",
                    numeric: true,
                    value: (e: typeof edge) => e.uncertainty_kcal_mol ?? null,
                  },
                  {
                    key: "overlap",
                    label: zh ? "最低相邻重叠" : "Minimum adjacent overlap",
                    numeric: true,
                    value: (e: typeof edge) =>
                      e.minimum_adjacent_overlap ?? null,
                  },
                  {
                    key: "quality",
                    label: zh ? "采样检查" : "Sampling check",
                    value: (e: typeof edge) =>
                      e.quality === "review_required"
                        ? zh
                          ? "需增加采样或审查"
                          : "More sampling / review needed"
                        : e.quality === "diagnostics_available"
                          ? zh
                            ? "诊断数据可用"
                            : "Diagnostics available"
                          : zh
                            ? "未报告"
                            : "Not reported",
                  },
                ]
              : []),
          ]}
        />
        <FreeEnergyForest
          edges={result.edges}
          selected={edge.id}
          onSelect={setSelected}
          language={language}
        />
      </div>
      <details className="simulation-method">
        <summary>{zh ? "方法与适用范围" : "Method and applicability"}</summary>
        <p>{result.method}</p>
        <p>
          {zh
            ? "用于同系列、相同净电荷的小分子，在同一蛋白坐标系中比较。规划阶段没有计算自由能；完成计算仍需检查采样、误差与模型适用性。"
            : "For congeneric, same-net-charge small molecules in one protein frame. A planned network has no calculated free energy. Completed calculations still require sampling, uncertainty and applicability review."}
        </p>
      </details>
      <SimulationFiles job={job} files={files} language={language} />
    </div>
  );
}
