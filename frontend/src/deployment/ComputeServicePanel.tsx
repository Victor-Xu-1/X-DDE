import { api } from "../api";
import type { Deployment } from "./client";

export function ComputeServicePanel({
  data,
  zh,
  busy,
  execute,
}: {
  data: Deployment;
  zh: boolean;
  busy: boolean;
  execute(action: () => Promise<unknown>): Promise<void>;
}) {
  const service = data.compute_service;
  if (!service) return null;
  const working = (service.active ?? 0) + (service.queued ?? 0) > 0;
  return (
    <section
      className="setup-card compute-service-panel"
      aria-label={zh ? "原生计算服务" : "Native compute service"}
    >
      <div className="section-heading">
        <h2>{zh ? "计算服务" : "Compute service"}</h2>
        <span
          className={service.ready ? "status-pill installed" : "status-pill"}
        >
          {service.ready
            ? zh
              ? "已就绪"
              : "Ready"
            : service.running
              ? zh
                ? "资源待配置"
                : "Resources needed"
              : zh
                ? "已停止"
                : "Stopped"}
        </span>
      </div>
      {!service.ready && (
        <p className="field-help">
          {!service.configured
            ? zh
              ? "请先安装下方所需的计算组件，再启动服务。"
              : "Install the required compute components below, then start the service."
            : service.restart_required
              ? zh
                ? "环境已更新，点击“应用环境更新”使配置生效。"
                : "The environment changed. Apply the update to use its new configuration."
              : service.running
                ? zh
                  ? "服务正在运行，所需资源尚未就绪；请检查组件与模型。"
                  : "The service is running, but required resources are unavailable. Check its components and models."
                : zh
                  ? "启动计算服务后，可在运行状态中检查是否就绪。"
                  : "Start the compute service, then check its readiness in Runtime status."}
        </p>
      )}
      <div className="component-actions">
        <button
          disabled={
            busy ||
            working ||
            !service.configured ||
            (service.running && !service.restart_required)
          }
          onClick={() =>
            void execute(() =>
              api.post("/deployment/compute/start", {}, undefined, 120000),
            )
          }
        >
          {service.restart_required
            ? zh
              ? "应用环境更新"
              : "Apply environment update"
            : zh
              ? "启动计算服务"
              : "Start compute"}
        </button>
        <button
          className="secondary-button"
          disabled={busy || !service.running || working}
          onClick={() =>
            void execute(() => api.post("/deployment/compute/stop", {}))
          }
          title={
            zh
              ? "仅停止此 X-DDE 实例的空闲科学服务，保留研究数据。"
              : "Stop this instance's idle service and retain research data."
          }
        >
          {zh ? "停止计算服务" : "Stop compute"}
        </button>
        {working && (
          <span role="status">{zh ? "计算进行中" : "Tasks in progress"}</span>
        )}
      </div>
    </section>
  );
}
