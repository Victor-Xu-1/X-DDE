import { api } from "../api";
import type { Deployment } from "./client";
import { visibleDeploymentActivity } from "./component-groups";
import { researchError } from "../presentation/research-content";
import { componentName, names, states, stageLabel } from "./labels";

export function DeploymentActivity({
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
  const current = visibleDeploymentActivity(data);
  if (!current.length) return null;
  return (
    <section className="deployment-progress">
      <h2>{zh ? "正在部署" : "Deployment progress"}</h2>
      <div className="deployment-activity">
        {current.map((o) => {
          const item = data.packages.find((p) => p.id === o.package);
          return (
            <article key={o.id}>
              <div>
                <strong>
                  {item
                    ? componentName(item, zh)
                    : (zh && names[o.package]) || o.package}
                </strong>
                <span className="status-pill">
                  {zh ? states[o.state] : o.state}
                </span>
                <p role="status">{stageLabel(o.stage, zh)}</p>
                {o.error && (
                  <p className="error">{researchError(o.error, zh)}</p>
                )}
              </div>
              <div className="component-actions">
                {["queued", "running"].includes(o.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void execute(() =>
                        api.post(`/deployment/operations/${o.id}/pause`, {}),
                      )
                    }
                  >
                    {zh ? "暂停" : "Pause"}
                  </button>
                )}
                {["paused", "failed"].includes(o.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void execute(() =>
                        api.post(`/deployment/operations/${o.id}/resume`, {}),
                      )
                    }
                  >
                    {zh ? "继续 / 重试" : "Resume / retry"}
                  </button>
                )}
                {["paused", "failed", "queued"].includes(o.state) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void execute(() =>
                        api.post(`/deployment/operations/${o.id}/cancel`, {}),
                      )
                    }
                  >
                    {zh ? "取消" : "Cancel"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
