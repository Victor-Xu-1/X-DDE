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
      className="setup-card"
      aria-label={zh ? "原生计算服务" : "Native compute service"}
    >
      <div className="section-heading">
        <h2>{zh ? "本地科学计算" : "Local scientific compute"}</h2>
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
      <p className="field-help">
        {zh
          ? "原生科学计算使用本地模型。对话代理的模型服务在账户设置中另外配置。"
          : "Native scientific tools use local models. Configure the conversational agent provider separately in account settings."}
      </p>
      {service.reason && <p className="field-help">{service.reason}</p>}
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
