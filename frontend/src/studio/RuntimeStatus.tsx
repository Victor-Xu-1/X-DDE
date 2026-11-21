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
  const freeStorage = health?.free_disk_gib;
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
        </article>
        <article className="studio-panel">
          <DatabaseOutlined />
          <h3>{zh ? "研究存储" : "Research storage"}</h3>
          <p>
            {freeStorage == null
              ? "—"
              : `${freeStorage} GiB ${zh ? "可用" : "free"}`}
          </p>
        </article>
      </div>
      {health?.worker_error && (
        <p className="error-box" role="alert">
          {zh
            ? "任务服务暂不可用；已有文件已保留，请待服务恢复后再提交。"
            : "Task service unavailable. Existing files are retained; submit after the service recovers."}
        </p>
      )}
      <EnvironmentStatusTable
        engines={engines}
        connected={connected}
        language={language}
        onSetup={onSetup}
      />
    </section>
  );
}
