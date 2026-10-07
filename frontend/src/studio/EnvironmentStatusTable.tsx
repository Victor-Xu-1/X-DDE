import { Hint } from "../guided/Hint";
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
  openmm: ["结构局部优化", "Local structure refinement"],
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
}: {
  engines: Record<string, EngineStatus>;
  connected: boolean;
  language: Language;
}) {
  const zh = language === "zh",
    rows = Object.values(engines);
  return (
    <section
      className="runtime-environments"
      aria-label={zh ? "集成环境" : "Integrated environments"}
    >
      <div className="studio-heading">
        <h3>{zh ? "集成环境" : "Integrated environments"}</h3>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{zh ? "研究用途" : "Research use"}</th>
              <th>{zh ? "软件" : "Software"}</th>
              <th>{zh ? "状态" : "Status"}</th>
              <th>
                {zh ? "模型文件" : "Model files"}
                <Hint label={zh ? "模型文件检查说明" : "Model file check help"}>
                  {zh
                    ? "这里检查模型文件是否存在；推理验证与科学基准由实际任务另行确认。"
                    : "This checks whether model files exist. Inference and scientific benchmarks are verified separately through actual tasks."}
                </Hint>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((engine) => {
              const models = Object.values(engine.models ?? {});
              const ready =
                engine.ready &&
                (engine.id !== "harness" || engine.compute_configured);
              return (
                <tr key={engine.id}>
                  <th scope="row">
                    {researchUses[engine.id]?.[zh ? 0 : 1] ?? engine.name}
                  </th>
                  <td>
                    {engine.id === "drugclip"
                      ? zh
                        ? "X-DDE 快速筛选"
                        : "X-DDE fast screening"
                      : engine.name}
                  </td>
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
                  <td>
                    {models.length
                      ? `${models.filter(Boolean).length} / ${models.length}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p role="status">
          {zh ? "正在读取环境状态…" : "Loading environment status…"}
        </p>
      )}
    </section>
  );
}
