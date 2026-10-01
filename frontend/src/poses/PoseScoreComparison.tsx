import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ScoreComparisonResults } from "./ScoreComparisonResults";
import { loadPages } from "../research/loadPages";
import type { Language } from "../types";
import type { PoseSet } from "./types";
import type { ScoreComparison } from "./comparisonTypes";

export function PoseScoreComparison({
  value,
  outcomeIndex,
  language,
  onSelect,
}: {
  value: PoseSet;
  outcomeIndex: number;
  language: Language;
  onSelect: (stepId: string, record: number) => void;
}) {
  const zh = language === "zh";
  const [scope, setScope] = useState("current"),
    [choice, setChoice] = useState("empirical");
  const [history, setHistory] = useState<ScoreComparison[]>([]),
    [result, setResult] = useState<ScoreComparison | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    key = useRef({ body: "", id: "" });
  const epoch = useRef(0);
  useEffect(() => {
    alive.current = true;
    epoch.current += 1;
    setResult(null);
    setHistory([]);
    setError("");
    setBusy(false);
    key.current = { body: "", id: "" };
    const controller = new AbortController();
    void loadPages<ScoreComparison>(
      "/research/pose-score-comparisons?pose_set_id=" +
        encodeURIComponent(value.id),
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) setHistory(rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [value.id]);
  const outcomes =
    scope === "current" ? [value.outcomes[outcomeIndex]] : value.outcomes;
  const selections = outcomes.flatMap((o) =>
    o.poses
      .filter((p) => p.reference)
      .map((p) => ({
        step_id: o.combination.step_id,
        record: p.evidence.record,
      })),
  );
  const metrics =
    choice === "empirical"
      ? ["minimizedAffinity"]
      : choice === "pose"
        ? ["minimizedAffinity", "CNNscore"]
        : ["minimizedAffinity", "CNNscore", "CNNaffinity"];
  async function compare() {
    const generation = epoch.current;
    setBusy(true);
    setError("");
    const body = { pose_set_id: value.id, selections, metrics },
      encoded = JSON.stringify(body);
    if (key.current.body !== encoded)
      key.current = { body: encoded, id: crypto.randomUUID() };
    try {
      const saved = await api.post<ScoreComparison>(
        "/research/pose-score-comparisons",
        body,
        key.current.id,
      );
      if (alive.current && generation === epoch.current) {
        setResult(saved);
        setHistory((rows) => [saved, ...rows.filter((r) => r.id !== saved.id)]);
      }
    } catch (e) {
      if (alive.current && generation === epoch.current) setError(String(e));
    } finally {
      if (alive.current && generation === epoch.current) setBusy(false);
    }
  }
  return (
    <details className="pose-score-comparison">
      <summary>{zh ? "比较原生评分" : "Compare native scores"}</summary>
      <p
        className="field-help"
        title={
          zh
            ? "相同受体、位点、化学状态、原生方法与参数才在同组比较。仅初始构象/随机种子可变化。第1层表示没有另一个同组姿势在所有所选指标上不差且至少一项更好；不等于实验更有效，也不是姿势簇。"
            : "Only equal receptor, site, chemical state, native method and options share a comparison. Initial conformers/seeds can vary. Front 1 means no same-group pose is at least as good on every selected metric and strictly better on one. Not efficacy evidence or a pose cluster."
        }
      >
        {zh
          ? "同条件分组；保留原始单位，不混成总分。缺失指标保留为无法比较。"
          : "Separate equal-condition groups; retain native units with no composite score. Missing metrics remain unranked."}
      </p>
      <label className="field">
        {zh ? "比较哪些姿势？" : "Which poses?"}
        <select
          value={scope}
          disabled={busy}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="current">
            {zh
              ? "当前组合的可用姿势（推荐）"
              : "Usable poses in current combination (recommended)"}
          </option>
          <option value="all">
            {zh
              ? "本集合全部可用姿势，按条件分组"
              : "All usable poses in this ensemble, grouped by conditions"}
          </option>
        </select>
      </label>
      <label className="field">
        {zh ? "如何比较？" : "Which score comparison?"}
        <select
          value={choice}
          disabled={busy}
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="empirical">
            {zh
              ? "经验对接分数，由低到高（推荐）"
              : "Empirical score, lower is better (recommended)"}
          </option>
          <option value="pose">
            {zh
              ? "经验分数与模型姿势分数，保留取舍"
              : "Empirical and CNN pose scores; retain tradeoffs"}
          </option>
          <option value="all">
            {zh
              ? "全部三种原生分数，保留取舍"
              : "All three native scores; retain tradeoffs"}
          </option>
        </select>
      </label>
      {selections.length > 256 && (
        <p role="status">
          {zh
            ? "本次最多比较256个姿势，请选择当前组合；不会自动截断结果。"
            : "Select the current combination: this comparison is limited to 256 poses; results are never silently truncated."}
        </p>
      )}
      <button
        className="primary-button"
        type="button"
        disabled={busy || !selections.length || selections.length > 256}
        onClick={() => void compare()}
      >
        {busy
          ? zh
            ? "正在比较…"
            : "Comparing…"
          : zh
            ? "比较并保存证据"
            : "Compare and save evidence"}
      </button>
      {error && <p role="alert">{error}</p>}
      {history.length > 0 && (
        <label className="field">
          {zh ? "查看已保存比较" : "Saved comparisons"}
          <select
            value={result?.id ?? ""}
            onChange={(e) =>
              setResult(history.find((r) => r.id === e.target.value) ?? null)
            }
          >
            <option value="">
              {zh ? "选择已有比较" : "Choose a saved comparison"}
            </option>
            {history.map((r) => (
              <option key={r.id} value={r.id}>
                {r.created_at} · {r.request.selections.length}
              </option>
            ))}
          </select>
        </label>
      )}
      {result && (
        <ScoreComparisonResults
          result={result}
          value={value}
          language={language}
          onSelect={onSelect}
        />
      )}
    </details>
  );
}
