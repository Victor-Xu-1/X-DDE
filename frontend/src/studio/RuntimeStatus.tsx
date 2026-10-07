import { DatabaseOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import type { EngineStatus, Health, Language } from "../types";
import "./runtime-status.css";
import { EnvironmentStatusTable } from "./EnvironmentStatusTable";

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
      <div className="runtime-summary">
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
        <article className="studio-panel">
          <DatabaseOutlined />
          <h3>{zh ? "X-DDE 研究数据" : "X-DDE research data"}</h3>
          <p>
            {health?.free_disk_gib ?? "—"} GiB {zh ? "可用" : "free"}
          </p>
        </article>
      </div>
      <EnvironmentStatusTable
        engines={engines}
        connected={connected}
        language={language}
      />
    </section>
  );
}
