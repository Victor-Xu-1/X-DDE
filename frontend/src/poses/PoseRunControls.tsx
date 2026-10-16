import { historyChoiceLabel } from "../presentation/history-choice";
import { RunMonitor, workflowStateLabel } from "../workflows/RunMonitor";
import type { WorkflowRun } from "../workflows/types";
import type { Language } from "../types";
import type { Exploration } from "./types";
import { poseSourceLabel } from "./source-label";

export function PoseRunControls({
  value,
  language,
  run,
  history,
  ready,
  busy,
  loading,
  captured,
  onStart,
  onRepeat,
  onRun,
  onUpdate,
  onCapture,
}: {
  value: Exploration;
  language: Language;
  run: WorkflowRun | null;
  history: WorkflowRun[];
  ready: boolean;
  busy: boolean;
  loading: boolean;
  captured: boolean;
  onStart(): void;
  onRepeat(): void;
  onRun(id: string): void;
  onUpdate(run: WorkflowRun): void;
  onCapture(): void;
}) {
  const zh = language === "zh";
  const docking = value.request.options.docking;
  const terminal =
    !!run && ["succeeded", "failed", "cancelled"].includes(run.state);
  return (
    <div className="pose-run-controls">
      <dl className="questionnaire-review">
        <dt>{zh ? "每次搜索" : "Per search"}</dt>
        <dd>
          {docking.cpu} {zh ? "核" : "core(s)"} · {docking.memory_mib} MiB ·{" "}
          {docking.time_limit_seconds} s
        </dd>
        <dt>{zh ? "搜索方案" : "Search method"}</dt>
        <dd>
          {docking.scoring}
          {docking.cnn_scoring !== "none"
            ? zh
              ? " · 神经网络评分"
              : " · neural scoring"
            : ""}
        </dd>
        <dt>{zh ? "计划时间上限" : "Plan wall limit"}</dt>
        <dd>{value.request.options.wall_seconds} s</dd>
      </dl>
      <details>
        <summary>
          {zh ? "配套输入与随机种子" : "Paired inputs and random seeds"}
        </summary>
        <ul>
          {value.combinations.map((c) => (
            <li key={c.step_id}>
              {zh ? "受体 " : "Receptor "}
              {c.member_index + 1} · {poseSourceLabel(c, language)} ·{" "}
              {zh ? "分子 " : "Ligand "}
              {c.ligand_index + 1} · {zh ? "种子 " : "Seed "}
              {c.seed}
            </li>
          ))}
        </ul>
      </details>
      {loading && (
        <p role="status">
          {zh ? "读取运行记录与环境…" : "Loading run history and environment…"}
        </p>
      )}
      {!loading && !ready && (
        <p className="notice">
          {zh
            ? "计算环境尚未就绪；已保存的结果仍可查看和下载。"
            : "The compute environment is not ready; saved results remain available to inspect and download."}
        </p>
      )}
      {!run && history.length === 0 && (
        <button
          className="primary-button"
          type="button"
          disabled={!ready || busy || loading}
          onClick={onStart}
        >
          {zh ? "启动已审阅的姿势探索" : "Start reviewed pose exploration"}
        </button>
      )}
      {history.length > 0 && (
        <label className="field">
          {zh ? "已执行的运行" : "Existing runs"}
          <select value={run?.id ?? ""} onChange={(e) => onRun(e.target.value)}>
            {!run && (
              <option value="">{zh ? "选择运行记录" : "Choose a run"}</option>
            )}
            {history.map((r, index) => (
              <option key={r.id} value={r.id}>
                {historyChoiceLabel(
                  zh ? "运行" : "Run",
                  index,
                  zh,
                  r.created_at,
                )}{" "}
                · {workflowStateLabel(r.state, zh)}
              </option>
            ))}
          </select>
        </label>
      )}
      {run && (
        <RunMonitor
          key={run.id}
          initial={run}
          language={language}
          onChange={onUpdate}
        />
      )}
      {terminal && !captured && (
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={onCapture}
        >
          {zh ? "保存所有组合与姿势" : "Capture all combinations and poses"}
        </button>
      )}
      {terminal && (
        <button
          className="secondary-button"
          type="button"
          disabled={!ready || busy}
          onClick={onRepeat}
        >
          {zh ? "再运行一次此计划" : "Run this plan again"}
        </button>
      )}
    </div>
  );
}
