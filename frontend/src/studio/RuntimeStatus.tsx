import { DatabaseOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import type { EngineStatus, Health, Language } from "../types";
import "./runtime-status.css";
const researchUses: Record<string, [string, string]> = {
  opendde: ["结构与复合物预测", "Structure & complex prediction"],
  diffsbdd: ["小分子生成与优化", "Small-molecule generation & optimization"],
  harness: ["蛋白与抗体工具", "Protein & antibody tools"],
  p2rank: ["口袋寻找", "Pocket finding"],
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
};

export function RuntimeStatus({
  language,
  health,
  connectionError,
  onRefresh,
  onSetup,
}: {
  language: Language;
  health: Health | null;
  connectionError: boolean;
  onRefresh(): void;
  onSetup(): void;
}) {
  const zh = language === "zh";
  const connected = Boolean(health && !connectionError);
  const platformReady =
    connected && (health?.platform?.ready ?? health?.worker_ready);
  // Existing installed servers expose only the historical OpenDDE snapshot.
  const engines: Record<string, EngineStatus> =
    health?.environments ??
    health?.engines ??
    (health
      ? {
          opendde: {
            id: "opendde",
            name: "OpenDDE",
            description: "",
            execution_backend: "docker",
            operations: [],
            ...health.engine,
          },
        }
      : {});
  return (
    <section className="utility-page runtime-workspace">
      <h1 className="sr-only">{zh ? "运行状态" : "Runtime status"}</h1>
      {connectionError && (
        <p className="error-box" role="alert">
          {zh
            ? "与 X-DDE 的连接已中断；下方保留的状态可能尚未更新。"
            : "Connection to X-DDE lost; retained status may be out of date."}{" "}
          <button onClick={onRefresh}>{zh ? "重新连接" : "Reconnect"}</button>
        </p>
      )}
      <div className="model-grid">
        <article className="studio-panel">
          <DeploymentUnitOutlined />
          <h3>{zh ? "工作台服务" : "Workbench service"}</h3>
          <span
            className={
              "status " + (platformReady ? "succeeded" : "interrupted")
            }
          >
            {connectionError
              ? zh
                ? "连接已中断"
                : "Disconnected"
              : !health
                ? zh
                  ? "正在连接 X-DDE…"
                  : "Connecting to X-DDE…"
                : platformReady
                  ? zh
                    ? "平台服务就绪"
                    : "Platform service ready"
                  : zh
                    ? "平台服务未就绪"
                    : "Platform service unavailable"}
          </span>
          {health?.worker_error && (
            <p role="alert">
              {zh
                ? "任务服务暂不可用，请检查安装状态。"
                : "Task service unavailable; check installation status."}
            </p>
          )}

          <button className="secondary-button" onClick={onSetup}>
            {zh ? "管理集成环境" : "Manage integrated environments"}
          </button>
        </article>
        {Object.values(engines).map((engine) => {
          const harness = engine.id === "harness";
          const modelFiles = Object.values(engine.models ?? {});
          return (
            <article className="studio-panel" key={engine.id}>
              <DeploymentUnitOutlined />
              <h3>{researchUses[engine.id]?.[zh ? 0 : 1] ?? engine.name}</h3>
              <small>{engine.name}</small>
              <span
                className={
                  "status " +
                  (!connected
                    ? "interrupted"
                    : engine.ready
                      ? "succeeded"
                      : "failed")
                }
              >
                {!connected
                  ? zh
                    ? "状态尚未更新"
                    : "State may be out of date"
                  : engine.ready
                    ? harness
                      ? zh
                        ? engine.compute_configured
                          ? "任务服务已配置"
                          : "需配置计算服务"
                        : engine.compute_configured
                          ? "Task services configured"
                          : "Compute setup required"
                      : zh
                        ? "环境检查通过"
                        : "Environment checks passed"
                    : zh
                      ? "环境未就绪"
                      : "Environment unavailable"}
              </span>
              {connected && !engine.ready && (
                <p className="field-help">
                  {zh
                    ? "在安装与组件中完成配置。"
                    : "Complete setup in Installation & components."}
                </p>
              )}
              {modelFiles.length > 0 && (
                <details>
                  <summary>{zh ? "模型资源" : "Model resources"}</summary>
                  <p
                    title={
                      zh
                        ? "文件存在检查不等于模型推理或科学基准通过。"
                        : "File checks do not establish inference or scientific validity."
                    }
                  >
                    {zh ? "模型文件：" : "Model files: "}
                    {modelFiles.filter(Boolean).length} / {modelFiles.length}
                  </p>
                </details>
              )}
              {harness && (
                <p>
                  {engine.compute_configured
                    ? zh
                      ? "提交任务时会检查相应的计算或检索服务。"
                      : "Each task checks its required compute or search service before submission."
                    : zh
                      ? "在安装与组件中完成服务配置后，可提交需要计算服务的任务。"
                      : "Configure the service in Installation & components before submitting compute-dependent tasks."}
                </p>
              )}
            </article>
          );
        })}
        <article className="studio-panel">
          <DatabaseOutlined />
          <h3>{zh ? "X-DDE 研究数据" : "X-DDE research data"}</h3>
          <p>
            {health?.free_disk_gib ?? "—"} GiB {zh ? "可用" : "free"}
          </p>
        </article>
      </div>
    </section>
  );
}
