import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { WorkflowRun } from "./types";
const names: Record<string, [string, string]> = {
  running: ["执行中", "Running"],
  paused: ["已暂停调度", "Dispatch paused"],
  blocked: ["需要处理输入或配置", "Needs input or configuration"],
  cancelling: ["取消中", "Cancelling"],
  cancelled: ["已取消", "Cancelled"],
  succeeded: ["已完成", "Succeeded"],
  failed: ["失败", "Failed"],
};
export function RunMonitor({
  initial,
  language,
}: {
  initial: WorkflowRun;
  language: Language;
}) {
  const zh = language === "zh",
    [run, setRun] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => setRun(initial), [initial.id]);
  useEffect(() => {
    if (["succeeded", "failed", "cancelled"].includes(run.state)) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      void request<WorkflowRun>(`/workflows/runs/${run.id}`, {
        signal: c.signal,
      })
        .then((value) => {
          if (!c.signal.aborted) setRun(value);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    }, 1500);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [run]);
  async function action(action: "pause" | "resume" | "cancel") {
    setBusy(true);
    setError("");
    try {
      setRun(
        await api.post<WorkflowRun>(`/workflows/runs/${run.id}/${action}`, {}),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="setup-card"
      aria-label={zh ? "研究计划运行" : "Research plan run"}
    >
      <h2>{names[run.state]?.[zh ? 0 : 1] ?? run.state}</h2>
      <p>{run.reason}</p>
      <p className="field-help">
        {zh
          ? "暂停只阻止创建后续任务；已进入任务队列的计算会继续。取消通过原有任务系统停止任务，同步外部工具可能需要等待返回。重试有明确上限和退避。"
          : "Pause prevents later dispatch; already queued or running tasks continue. Cancellation uses the existing task system; synchronous external tools may need to return. Retries have explicit bounds and backoff."}
      </p>
      <div className="editor-toolbar">
        {run.state === "running" && (
          <button
            disabled={busy}
            type="button"
            onClick={() => void action("pause")}
          >
            {zh ? "暂停后续步骤" : "Pause later steps"}
          </button>
        )}
        {["paused", "blocked"].includes(run.state) && (
          <button
            disabled={busy}
            type="button"
            onClick={() => void action("resume")}
          >
            {zh ? "处理后继续" : "Resume after resolution"}
          </button>
        )}
        {["running", "paused", "blocked", "cancelling"].includes(run.state) && (
          <button
            disabled={busy}
            type="button"
            onClick={() => void action("cancel")}
          >
            {zh ? "取消计划运行" : "Cancel plan run"}
          </button>
        )}
      </div>
      <ol>
        {run.attempts.map((a) => (
          <li key={a.job_id}>
            {a.step_id} · {zh ? "尝试" : "Attempt"} {a.attempt + 1} · {a.status}{" "}
            <a href={`/#task=${a.job_id}`}>
              {zh ? "查看原生任务" : "Open task"}
            </a>
            {a.error && <p>{a.error}</p>}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
