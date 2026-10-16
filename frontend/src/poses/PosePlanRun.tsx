import { useCallback, useEffect, useRef, useState } from "react";
import { useExample } from "../examples/context";
import { api, request } from "../api";
import { loadPages } from "../research/loadPages";
import type { WorkflowRun } from "../workflows/types";
import type { Language } from "../types";
import { PoseResults } from "./PoseResults";
import type { Exploration, PoseSet } from "./types";
import { PoseRunControls } from "./PoseRunControls";
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
    [reload, setReload] = useState(0),
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
    setError("");
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
          setRun(
            (current) =>
              r.find((row) => row.id === current?.id) ??
              preset?.run ??
              r[0] ??
              null,
          );
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
  }, [value.id, value.plan_id, reload]);
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
  const currentSets = run ? sets.filter((s) => s.run_id === run.id) : [];
  const saved = currentSets.find((s) => s.id === selected) ?? currentSets[0];
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
      {currentSets.length > 1 && (
        <label className="field">
          {zh ? "已保存姿势集合" : "Saved pose ensembles"}
          <select
            value={saved?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {currentSets.map((s, index) => (
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
      <details className="pose-run-settings" open={!saved}>
        <summary>
          {zh ? "计算设置与运行记录" : "Run settings and history"}
        </summary>
        <PoseRunControls
          value={value}
          language={language}
          run={run}
          history={history}
          ready={ready}
          busy={busy}
          loading={loading}
          captured={Boolean(saved)}
          onStart={() => void start()}
          onRepeat={() => {
            runKey.current = crypto.randomUUID();
            void start();
          }}
          onRun={(id) => {
            setRun(history.find((r) => r.id === id) ?? null);
            setSelected("");
          }}
          onUpdate={updateRun}
          onCapture={() => void capture()}
        />
      </details>
      {error && (
        <div className="error-box">
          <p role="alert">{error}</p>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || busy}
            onClick={() => setReload((v) => v + 1)}
          >
            {zh ? "重新读取结果" : "Retry loading results"}
          </button>
        </div>
      )}
    </section>
  );
}
