import { useState } from "react";
import { api, request } from "../api";
import type { Deployment } from "./client";
import { pendingStates, type DeploymentOperation } from "./component-groups";
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
  const [log, setLog] = useState<string | null>(null);
  // Snapshot order is newest first. Superseded failures belong to history.
  const latest = new Map<string, string>();
  data.operations.forEach((o) => {
    if (!latest.has(o.package)) latest.set(o.package, o.id);
  });
  const current = data.operations.filter(
    (o) =>
      pendingStates.has(o.state) ||
      (o.state === "failed" && latest.get(o.package) === o.id),
  );
  const currentIds = new Set(current.map((o) => o.id));
  const history = data.operations.filter((o) => !currentIds.has(o.id));
  function rows(operations: DeploymentOperation[]) {
    return (
      <div className="deployment-activity">
        {operations.map((o) => (
          <article key={o.id}>
            <div>
              <strong>
                {data.packages.find((p) => p.id === o.package)
                  ? componentName(
                      data.packages.find((p) => p.id === o.package)!,
                      zh,
                    )
                  : (zh && names[o.package]) || o.package}
              </strong>
              <span className="status-pill">
                {zh ? states[o.state] : o.state}
              </span>
              <p role="status">{stageLabel(o.stage, zh)}</p>
              {o.error && <p className="error">{o.error}</p>}
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
              <button
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    const result = await request<{ text: string }>(
                      `/deployment/operations/${o.id}/log`,
                    );
                    setLog(
                      result.text ||
                        (zh
                          ? "尚无进程日志；下载进度见上方状态。"
                          : "No process log; see download state above."),
                    );
                  })
                }
              >
                {zh ? "日志" : "Log"}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }
  return (
    <section className="deployment-progress">
      {current.length > 0 && (
        <>
          <h2>
            {zh ? "安装进度" : "Installation activity"}{" "}
            <small>{current.length}</small>
          </h2>
          {rows(current)}
        </>
      )}
      {history.length > 0 && (
        <details className="deployment-disclosure deployment-history">
          <summary>
            <strong>{zh ? "安装历史" : "Installation history"}</strong>
            <span>{history.length}</span>
          </summary>
          {rows(history)}
        </details>
      )}
      {log !== null && (
        <section className="setup-card">
          <button onClick={() => setLog(null)}>
            {zh ? "关闭日志" : "Close log"}
          </button>
          <pre className="deployment-log">{log}</pre>
        </section>
      )}
    </section>
  );
}
