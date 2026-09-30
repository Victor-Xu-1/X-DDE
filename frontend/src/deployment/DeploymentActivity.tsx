import { useState } from "react";
import { api, request } from "../api";
import type { Deployment } from "./client";
import { names, states } from "./labels";
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
  return (
    <>
      {" "}
      <h2>{zh ? "安装进度" : "Installation activity"}</h2>
      {!data.operations.length && (
        <p className="empty">
          {zh
            ? "还没有安装任务。选择上方方案即可开始。"
            : "No installations yet. Choose a starting point above."}
        </p>
      )}
      <div className="deployment-activity">
        {data.operations.slice(0, 20).map((o) => (
          <article key={o.id}>
            <div>
              <strong>{zh ? names[o.package] : o.package}</strong>
              <span className="status-pill">
                {zh ? states[o.state] : o.state}
              </span>
              <p role="status">{o.stage}</p>
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
      {log !== null && (
        <section className="setup-card">
          <button onClick={() => setLog(null)}>
            {zh ? "关闭日志" : "Close log"}
          </button>
          <pre className="deployment-log">{log}</pre>
        </section>
      )}
    </>
  );
}
