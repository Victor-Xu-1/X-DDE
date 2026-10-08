import { useState } from "react";
import { artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
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
      <div className="simulation-main-grid">
        <FreeEnergyNetwork
          result={result}
          selected={edge.id}
          onSelect={setSelected}
          language={language}
        />
        <ResearchTabs
          label={zh ? "所选分子变化" : "Selected molecular change"}
          tabs={[
            {
              id: "molecules",
              label: zh ? "分子与原子映射" : "Molecules and atom map",
              content: (
                <section>
                  <div className="simulation-molecule-pair">
                    {[a, b].map((node, i) => (
                      <div key={node.id}>
                        <h4>
                          {i === 0 ? "A" : "B"} · {node.id}
                        </h4>
                        <MoleculeImage
                          source={{
                            url: artifactUrl(job.id, node.artifact),
                            record: 0,
                          }}
                          language={language}
                          label={node.id}
                        />
                      </div>
                    ))}
                  </div>
                  <dl className="simulation-readouts">
                    <div>
                      <dt>{zh ? "对应原子" : "Mapped atoms"}</dt>
                      <dd>{edge.atom_map.length}</dd>
                    </div>
                    <div>
                      <dt>{zh ? "映射适合度" : "Mapping suitability"}</dt>
                      <dd>{edge.mapping_score.toFixed(3)}</dd>
                    </div>
                    {edge.delta_delta_g_kcal_mol != null && (
                      <div>
                        <dt>ΔΔG ± uncertainty</dt>
                        <dd>
                          {edge.delta_delta_g_kcal_mol.toFixed(2)} ±{" "}
                          {edge.uncertainty_kcal_mol?.toFixed(2)}{" "}
                          <small>kcal/mol</small>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <details className="simulation-method">
                    <summary>
                      {zh ? "查看原子对应" : "Inspect atom correspondence"}
                    </summary>
                    <ResearchTable
                      rows={edge.atom_map.map(([ai, bi]) => ({ a: ai, b: bi }))}
                      language={language}
                      title={zh ? "原子映射" : "Atom map"}
                      rowId={(r) => String(r.a)}
                      exportName="atom-map.csv"
                      columns={[
                        {
                          key: "a",
                          label: zh
                            ? "A 原子索引（从 0 开始）"
                            : "A atom index (zero-based)",
                          value: (r) => r.a,
                        },
                        {
                          key: "b",
                          label: zh
                            ? "B 原子索引（从 0 开始）"
                            : "B atom index (zero-based)",
                          value: (r) => r.b,
                        },
                      ]}
                    />
                  </details>
                </section>
              ),
            },
            ...(protein
              ? [
                  {
                    id: "structure",
                    label: zh ? "结合姿势" : "Binding poses",
                    content: (
                      <ResearchTabs
                        label={zh ? "分子姿势" : "Molecular poses"}
                        tabs={[a, b].map((n) => ({
                          id: n.id,
                          label: n.id,
                          content: (
                            <StructureViewer
                              urls={[
                                artifactUrl(job.id, protein),
                                artifactUrl(job.id, n.artifact),
                              ]}
                              language={language}
                            />
                          ),
                        }))}
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
      </div>
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
                    key: "quality",
                    label: zh ? "采样检查" : "Sampling check",
                    value: (e: typeof edge) =>
                      e.quality === "review_required"
                        ? zh
                          ? "需增加采样或审查"
                          : "More sampling / review needed"
                        : zh
                          ? "诊断数据可用"
                          : "Diagnostics available",
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
