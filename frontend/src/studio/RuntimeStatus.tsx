import { DatabaseOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import type { EngineStatus, Health, Language } from "../types";

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
      <h1>{zh ? "运行状态" : "Runtime status"}</h1>
      <p>
        {zh
          ? "X-DDE 平台后端统一管理 API、任务、资产和环境。OpenDDE、DiffSBDD、Harness 分别提供计算能力，各自配置和检查。"
          : "The X-DDE platform server manages APIs, tasks, assets and environments. OpenDDE, DiffSBDD and Harness supply independently configured scientific capabilities."}
      </p>
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
          <h3>{zh ? "X-DDE 平台后端" : "X-DDE platform server"}</h3>
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
          <p>
            {zh
              ? "任务队列、科学资产版本、来源关系与软件部署由同一个服务管理。计算引擎缺失只影响依赖它的任务。"
              : "One service owns the task queue, scientific asset versions, provenance and deployment. Missing engines affect only tasks that require them."}
          </p>
          {health?.worker_error && <p role="alert">{health.worker_error}</p>}
          <button className="secondary-button" onClick={onSetup}>
            {zh ? "管理计算引擎与环境" : "Manage engines & environments"}
          </button>
        </article>
        {Object.values(engines).map((engine) => {
          const harness = engine.id === "harness";
          const modelFiles = Object.values(engine.models ?? {});
          return (
            <article className="studio-panel" key={engine.id}>
              <DeploymentUnitOutlined />
              <h3>
                {engine.name} ·{" "}
                {harness
                  ? zh
                    ? "科学工具"
                    : "Scientific tools"
                  : zh
                    ? "计算引擎"
                    : "Scientific engine"}
              </h3>
              <p>
                {engine.description.split(" / ")[zh ? 0 : 1] ??
                  engine.description}
              </p>
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
                        ? "客户端已配置"
                        : "Client configured"
                      : zh
                        ? "环境检查通过"
                        : "Environment checks passed"
                    : zh
                      ? "环境未就绪"
                      : "Environment unavailable"}
              </span>
              {engine.reason && <p role="alert">{engine.reason}</p>}
              {engine.gpu && <p>GPU · {engine.gpu.split(",")[0]}</p>}
              {modelFiles.length > 0 && (
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
              )}
              {harness && (
                <p>
                  {engine.compute_configured
                    ? zh
                      ? "计算服务地址已配置"
                      : "Compute service address configured"
                    : zh
                      ? "计算服务尚未配置"
                      : "Compute service not configured"}
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
          <p>
            {zh
              ? "结构、分子和结果统一登记为可复用资产；编辑保留原版本。外部原生结果保留其真实来源。"
              : "Structures, molecules and results become reusable assets. Edits preserve prior versions; native results retain their provenance."}
          </p>
        </article>
      </div>
      <p className="field-help">
        {zh
          ? "环境检查通过表示运行配置已通过检查；模型、GPU、远程服务与科学准确性仍按所选任务分别验收。"
          : "Runtime checks establish configuration only. Models, GPUs, remote services and scientific validity require task-specific acceptance."}
      </p>
    </section>
  );
}
