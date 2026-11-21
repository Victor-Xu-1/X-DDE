import { useState } from "react";
import { Hint } from "../guided/Hint";
import { useBackendRuntime } from "../utilities/backend-runtime";
import { BackendStateMessage, RuntimeSwitch } from "../utilities/RuntimeSwitch";
import "../utilities/runtime-switch.css";
import type { EngineStatus, Language } from "../types";

const researchUses: Record<string, [string, string]> = {
  opendde: ["结构与复合物预测", "Structure & complex prediction"],
  diffsbdd: ["小分子生成与优化", "Small-molecule generation & optimization"],
  harness: ["蛋白与抗体工具", "Protein & antibody tools"],
  p2rank: ["口袋寻找", "Pocket finding"],
  caver: ["口袋通道与瓶颈", "Pocket channels & bottlenecks"],
  gnina: ["对接与姿势评估", "Docking & pose evaluation"],
  chemistry: ["分子状态与构象准备", "Molecular states & conformers"],
  biopython: ["受体结构准备与对齐", "Receptor preparation & alignment"],
  anarcii: ["抗体编号与 CDR 标注", "Antibody numbering & CDR annotation"],
  sapiens: [
    "抗体人源参考与框架建议",
    "Antibody human reference & framework proposals",
  ],
  admet: ["性质与早期安全性", "Properties & early safety"],
  posebusters: ["构象与姿势质控", "Conformer & pose quality"],
  discovery: ["靶点与公共研究材料", "Targets & public research materials"],
  drugclip: ["高通量筛选", "High-throughput screening"],
  deli: ["DEL 数据分析", "DEL data analysis"],
  mol1: ["复合物结构预测", "Complex structure prediction"],
  boltz: ["复合物与亲和力预测", "Complex and affinity prediction"],
  boltzgen: ["结合蛋白、肽与抗体设计", "Binder, peptide and antibody design"],
  ligandmpnn: [
    "配体环境中的蛋白序列设计",
    "Protein sequence design with ligand context",
  ],
  reinvent: [
    "类似物与多目标分子设计",
    "Analogue and multi-objective molecular design",
  ],
  openmm: ["分子动力学与结构优化", "Molecular dynamics & structure refinement"],
  openfe: ["相对结合自由能", "Relative binding free energy"],
  gromacs: ["分子动力学", "Molecular dynamics"],
  apbs: ["蛋白表面电势", "Protein surface potential"],
  plip: ["结合相互作用分析", "Binding interaction analysis"],
  chemprop: ["实验数据性质模型", "Experimental-data property models"],
  deepternary: ["三元复合物建模", "Ternary complex modeling"],
};

function statusLabel(engine: EngineStatus, connected: boolean, zh: boolean) {
  if (!connected) return zh ? "状态尚未更新" : "State may be out of date";
  if (!engine.ready) return zh ? "环境未就绪" : "Environment unavailable";
  if (engine.id === "harness")
    return engine.compute_configured
      ? zh
        ? "任务服务已配置"
        : "Task services configured"
      : zh
        ? "需配置计算服务"
        : "Compute setup required";
  return zh ? "环境检查通过" : "Environment checks passed";
}

export function EnvironmentStatusTable({
  engines,
  connected,
  language,
  onSetup,
}: {
  engines: Record<string, EngineStatus>;
  connected: boolean;
  language: Language;
  onSetup(): void;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const rows = Object.values(engines).map((engine) => ({
    engine,
    name:
      engine.id === "drugclip"
        ? zh
          ? "X-DDE 快速筛选"
          : "X-DDE fast screening"
        : engine.name,
    use: researchUses[engine.id]?.[zh ? 0 : 1] ?? "",
  }));
  const matches = rows.filter(({ name, use }) =>
    [name, use].some((text) => text.toLowerCase().includes(search)),
  );
  const runtime = useBackendRuntime(
    connected,
    undefined,
    Boolean(engines.harness),
  );
  const powerRows = new Map(
    runtime.catalogue?.engines.map((row) => [row.id, row]),
  );
  return (
    <section
      className="runtime-environments"
      aria-label={zh ? "集成环境" : "Integrated environments"}
    >
      <div className="runtime-environment-header">
        <h3>{zh ? "集成环境" : "Integrated environments"}</h3>
        <div className="runtime-environment-actions">
          {rows.length > 0 && (
            <input
              type="search"
              aria-label={
                zh ? "搜索集成环境" : "Search integrated environments"
              }
              placeholder={zh ? "搜索软件或用途" : "Find software or use"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          <button className="secondary-button" onClick={onSetup}>
            {zh ? "管理集成环境" : "Manage integrated environments"}
          </button>
        </div>
      </div>
      {connected && (
        <BackendStateMessage
          runtime={runtime}
          language={language}
          failed={powerRows.has(runtime.failed)}
        />
      )}
      {matches.length > 0 ? (
        <div className="table-scroll">
          <table>
            <colgroup>
              <col className="runtime-identity-column" />
              <col className="runtime-status-column" />
              <col className="runtime-model-column" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{zh ? "软件与用途" : "Software & use"}</th>
                <th scope="col">{zh ? "环境状态" : "Environment status"}</th>
                <th scope="col">
                  <span className="runtime-model-heading">
                    {zh ? "模型" : "Models"}
                    <Hint
                      label={zh ? "模型文件检查说明" : "Model file check help"}
                    >
                      {zh
                        ? "这里检查模型文件是否存在；推理验证与科学基准由实际任务另行确认。"
                        : "This checks whether model files exist. Inference and scientific benchmarks are verified separately through actual tasks."}
                    </Hint>
                  </span>
                </th>
                <th scope="col">{zh ? "后端开关" : "Backend power"}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(({ engine, name, use }) => {
                const models = Object.values(engine.models ?? {});
                const power = connected ? powerRows.get(engine.id) : undefined;
                const ready =
                  engine.ready &&
                  (engine.id !== "harness" || engine.compute_configured);
                return (
                  <tr key={engine.id}>
                    <th scope="row">
                      <span>{name}</span>
                      {use && <small>{use}</small>}
                    </th>
                    <td>
                      <span
                        className={
                          "status " +
                          (!connected
                            ? "interrupted"
                            : ready
                              ? "succeeded"
                              : "failed")
                        }
                      >
                        {statusLabel(engine, connected, zh)}
                      </span>
                    </td>
                    <td className="runtime-model-count">
                      {models.length
                        ? `${models.filter(Boolean).length} / ${models.length}`
                        : "—"}
                    </td>
                    <td className="runtime-table-power">
                      {power ? (
                        <RuntimeSwitch
                          item={power}
                          language={language}
                          runtime={runtime}
                          showName={false}
                        />
                      ) : (
                        <span className="task-backend-pending">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="runtime-table-empty" role="status">
          {rows.length
            ? zh
              ? "没有匹配的集成环境。"
              : "No matching environments."
            : zh
              ? "正在读取环境状态…"
              : "Loading environment status…"}
        </p>
      )}
    </section>
  );
}
