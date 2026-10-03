import { historyChoiceLabel } from "../presentation/history-choice";
import { useCallback, useEffect, useRef, useState } from "react";
import { useExample } from "../examples/context";
import { api, request } from "../api";
import { loadPages } from "../research/loadPages";
import { RunMonitor, workflowStateLabel } from "../workflows/RunMonitor";
import type { WorkflowRun } from "../workflows/types";
import type { Language } from "../types";
import { PoseResults } from "./PoseResults";
import type { Exploration, PoseSet } from "./types";
export function PosePlanRun({
  value,
  language,
}: {
  value: Exploration;
  language: Language;
}) {
  const zh = language === "zh";
  const example = useExample(),
    preset =
      example?.record?.kind === "pose_exploration" &&
      example.record.value.id === value.id
        ? example.record
        : null;
  const [run, setRun] = useState<WorkflowRun | null>(preset?.run ?? null),
    [history, setHistory] = useState<WorkflowRun[]>([]),
    [sets, setSets] = useState<PoseSet[]>(preset?.poses ?? []),
    [selected, setSelected] = useState(preset?.poses[0]?.id ?? ""),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const updateRun = useCallback((current: WorkflowRun) => {
    setRun(current);
    setHistory((old) => [current, ...old.filter((r) => r.id !== current.id)]);
  }, []);
  const runKey = useRef(crypto.randomUUID()),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    setLoading(true);
    void Promise.all([
      loadPages<WorkflowRun>(
        "/workflows/runs?plan_id=" + value.plan_id,
        c.signal,
      ),
      loadPages<PoseSet>(
        "/research/pose-ensembles?exploration_id=" + value.id,
        c.signal,
      ),
      request<{ availability: { configuration_present: boolean } }>(
        "/capabilities/gnina.dock",
        { signal: c.signal },
      ),
    ])
      .then(([r, s, cap]) => {
        if (!c.signal.aborted) {
          setHistory(r);
          setSets(s);
          setReady(cap.availability.configuration_present);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      c.abort();
    };
  }, [value.id, value.plan_id]);
  async function start() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post<WorkflowRun>(
        "/workflows/plans/" + value.plan_id + "/runs",
        { plan_sha256: value.plan_sha256 },
        runKey.current,
      );
      if (mounted.current) {
        setRun(r);
        setHistory((v) => [r, ...v.filter((old) => old.id !== r.id)]);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function capture() {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const s = await api.post<PoseSet>(
        "/research/pose-explorations/" +
          value.id +
          "/runs/" +
          run.id +
          "/capture",
        {},
      );
      if (mounted.current) {
        setSets((v) => [s, ...v.filter((old) => old.id !== s.id)]);
        setSelected(s.id);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const terminal =
      !!run && ["succeeded", "failed", "cancelled"].includes(run.state),
    saved = sets.find((s) => s.id === selected);
  return (
    <section
      className="pose-plan-run"
      aria-label={zh ? "审阅与运行姿势探索" : "Review and run pose exploration"}
      aria-busy={loading || busy}
    >
      <p>
        {value.request.name} · {value.combinations.length}{" "}
        {zh ? "个独立组合" : "independent combinations"}
      </p>
      <details>
        <summary>
          {zh ? "检查配套输入与预算" : "Review paired inputs and budget"}
        </summary>
        <ul>
          {value.combinations.map((c) => (
            <li key={c.step_id}>
              {zh ? "受体 " : "Receptor "}
              {c.member_index + 1} · {zh ? "口袋 " : "Pocket "}
              {c.pocket_rank} · {zh ? "分子 " : "Ligand "}
              {c.ligand_index + 1} · seed {c.seed}
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
            ? "请先在安装与组件中配置独立 GNINA 环境。计划已保存，不会启动假计算。"
            : "Configure the independent GNINA environment in Installation & components. The plan is saved; no synthetic computation is started."}
        </p>
      )}
      {!run && (
        <button
          className="primary-button"
          type="button"
          disabled={!ready || busy || loading}
          onClick={() => void start()}
        >
          {zh ? "启动已审阅的姿势探索" : "Start reviewed pose exploration"}
        </button>
      )}
      {terminal && (
        <button
          className="secondary-button"
          type="button"
          disabled={!ready || busy}
          onClick={() => {
            runKey.current = crypto.randomUUID();
            void start();
          }}
        >
          {zh ? "再运行一次此计划" : "Run this plan again"}
        </button>
      )}
      {history.length > 0 && (
        <label className="field">
          {zh ? "已执行的运行" : "Existing runs"}
          <select
            value={run?.id ?? ""}
            onChange={(e) => {
              setRun(history.find((r) => r.id === e.target.value) ?? null);
              setSelected("");
            }}
          >
            <option value="">{zh ? "选择运行记录" : "Choose a run"}</option>
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
          onChange={updateRun}
        />
      )}
      {terminal && (
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void capture()}
        >
          {zh ? "保存所有组合与姿势" : "Capture all combinations and poses"}
        </button>
      )}
      {sets.length > 0 && (
        <label className="field">
          {zh ? "已保存姿势集合" : "Saved pose ensembles"}
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">
              {zh ? "选择结果集合" : "Choose a pose set"}
            </option>
            {sets.map((s, index) => (
              <option value={s.id} key={s.id}>
                {zh ? "结果集" : "Result set"} {index + 1} ·{" "}
                {s.qualified_pose_count}{" "}
                {zh ? "个可复用姿势" : "reusable poses"}
              </option>
            ))}
          </select>
        </label>
      )}
      {saved && (
        <PoseResults key={saved.id} value={saved} language={language} />
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
