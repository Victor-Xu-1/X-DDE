import { researchError } from "../presentation/research-content";
import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { WorkflowRun } from "./types";
const names: Record<string, [string, string]> = {
  queued: ["等待计算", "Queued"],
  interrupted: ["已中断", "Interrupted"],
  running: ["执行中", "Running"],
  paused: ["已暂停调度", "Dispatch paused"],
  blocked: ["需要处理输入或配置", "Needs input or configuration"],
  cancelling: ["取消中", "Cancelling"],
  cancelled: ["已取消", "Cancelled"],
  succeeded: ["已完成", "Succeeded"],
  failed: ["失败", "Failed"],
};
export function workflowStateLabel(state: string, zh: boolean) {
  return names[state]?.[zh ? 0 : 1] ?? state;
}
export function RunMonitor({
  initial,
  language,
  onChange,
}: {
  initial: WorkflowRun;
  language: Language;
  onChange?(value: WorkflowRun): void;
}) {
  const zh = language === "zh",
    [run, setRun] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pollFailures, setPollFailures] = useState(0),
    [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => setRun(initial), [initial.id]);
  useEffect(() => {
    onChange?.(run);
  }, [run, onChange]);
  useEffect(() => {
    if (
      ["succeeded", "failed", "cancelled"].includes(run.state) ||
      pollFailures >= 3
    )
      return;
    const c = new AbortController();
    const timer = setTimeout(
      () => {
        void request<WorkflowRun>(`/workflows/runs/${run.id}`, {
          signal: c.signal,
        })
          .then((value) => {
            if (!c.signal.aborted) {
              setRun(value);
              setError("");
              setPollFailures(0);
            }
          })
          .catch((e) => {
            if (!c.signal.aborted) {
              setError(String(e));
              setPollFailures((n) => n + 1);
            }
          });
      },
      Math.min(12000, 1500 * 2 ** pollFailures),
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [run, pollFailures, refreshNonce]);
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
      <h2>{workflowStateLabel(run.state, zh)}</h2>
      {run.reason && <p>{researchError(run.reason, zh)}</p>}
      <p className="field-help">
        {zh
          ? "暂停会停止启动后续步骤，当前计算仍继续；取消会请求停止整个计划，部分计算需要等待当前操作结束。"
          : "Pause stops later steps; current calculations continue. Cancel requests stopping the plan; some calculations must finish the current operation first."}
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
            {a.step_id} · {zh ? "尝试" : "Attempt"} {a.attempt + 1} ·{" "}
            {workflowStateLabel(a.status, zh)}{" "}
            <a href={`/#task=${a.job_id}`}>{zh ? "查看任务" : "Open task"}</a>
            {a.error && <p>{researchError(a.error, zh)}</p>}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="error-box">
          {researchError(error, zh)}
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError("");
              setPollFailures(0);
              setRefreshNonce((n) => n + 1);
            }}
          >
            {zh ? "重新读取运行状态" : "Reload run status"}
          </button>
        </p>
      )}
    </section>
  );
}
