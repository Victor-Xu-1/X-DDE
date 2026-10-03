import { historyChoiceLabel } from "../presentation/history-choice";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Hint } from "../guided/Hint";
import type { ReceptorSet } from "../receptors/types";
import type { Job, Language } from "../types";
import { schema } from "./generated";
import { eligibleJobs, preset } from "./model";
import { loadPages } from "../research/loadPages";
import { SiteResults } from "./SiteResults";
import type { SiteOptions, SiteSet } from "./types";
import "./sites.css";
export function SiteWorkspace({
  ensemble,
  language,
}: {
  ensemble: ReceptorSet;
  language: Language;
}) {
  const zh = language === "zh";
  const [jobs, setJobs] = useState<Job[]>([]),
    [sets, setSets] = useState<SiteSet[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<number, string>>({}),
    [choice, setChoice] = useState("balanced");
  const [expert, setExpert] = useState(false),
    [options, setOptions] = useState<SiteOptions>(preset("balanced"));
  const [selected, setSelected] = useState<string | null>(null),
    [reload, setReload] = useState(0);
  const pending = useRef<{ body: string; key: string } | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      loadPages<Job>(
        "/research/receptor-ensembles/" +
          encodeURIComponent(ensemble.id) +
          "/pocket-jobs",
        c.signal,
      ),
      loadPages<SiteSet>(
        "/research/site-sets?ensemble_id=" + encodeURIComponent(ensemble.id),
        c.signal,
      ),
    ])
      .then(([j, s]) => {
        if (!c.signal.aborted) {
          setJobs(j);
          setSets(s);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [ensemble.id, reload]);
  const members = ensemble.members.filter(
    (m) => m.reference && m.evidence.quality?.backbone_complete,
  );
  const selectedJobs = Object.values(picks).filter(Boolean);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const body = {
      name: zh ? "跨构象口袋关联" : "Cross-conformation site association",
      ensemble_id: ensemble.id,
      pocket_jobs: selectedJobs,
      options,
    };
    const encoded = JSON.stringify(body);
    if (!pending.current || pending.current.body !== encoded)
      pending.current = { body: encoded, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const value = await api.post<SiteSet>(
        "/research/site-sets",
        body,
        pending.current.key,
      );
      if (mounted.current) {
        setSets((v) => [value, ...v.filter((s) => s.id !== value.id)]);
        setSelected(value.id);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const labels: Record<keyof SiteOptions, [string, string]> = {
    maximum_center_distance: [
      "口袋中心最大距离（Å）",
      "Maximum center distance (Å)",
    ],
    minimum_jaccard: ["映射残基最小重叠率", "Minimum mapped residue Jaccard"],
    minimum_mapping_coverage: [
      "最小残基映射覆盖",
      "Minimum residue mapping coverage",
    ],
    minimum_shared_residues: ["最少共有残基数", "Minimum shared residues"],
  };
  const saved = sets.find((s) => s.id === selected);
  return (
    <section
      className="site-workspace"
      aria-label={zh ? "跨构象口袋关联" : "Cross-conformation site association"}
      aria-busy={loading || busy}
    >
      {loading && (
        <p role="status">
          {zh ? "读取可复用口袋任务…" : "Loading reusable pocket tasks…"}
        </p>
      )}
      <form onSubmit={(e) => void submit(e)}>
        <fieldset disabled={loading || busy}>
          {members.map((m) => {
            const matches = eligibleJobs(jobs, m.reference!);
            return (
              <label className="field" key={m.evidence.index}>
                {zh ? "受体" : "Receptor"} {m.evidence.index + 1} ·{" "}
                {zh ? "口袋任务" : "Pocket task"}
                <select
                  value={picks[m.evidence.index] ?? ""}
                  onChange={(e) => {
                    setError("");
                    setPicks((v) => ({
                      ...v,
                      [m.evidence.index]: e.target.value,
                    }));
                  }}
                >
                  <option value="">
                    {zh ? "不参与此次比较" : "Exclude from this comparison"}
                  </option>
                  {matches.map((j, index) => (
                    <option key={j.id} value={j.id}>
                      {historyChoiceLabel(
                        j.request.name,
                        index,
                        zh,
                        j.created_at,
                      )}
                    </option>
                  ))}
                </select>
                {!matches.length && (
                  <span className="field-help">
                    {zh
                      ? "尚无此对齐版本的成功口袋任务，请先使用“用此受体寻找口袋”。"
                      : "No successful pocket task for this aligned version. First use ‘Find pockets on this receptor’."}
                  </span>
                )}
              </label>
            );
          })}
          <label className="field">
            {zh ? "关联方式" : "Association sensitivity"}
            <Hint label={zh ? "关联方式说明" : "Association sensitivity help"}>
              {zh
                ? "同时检查中心距离与残基重叠；映射充分、预测配置一致才关联。阈值用于探索，未做靶点专项校准。"
                : "Check center distance and residue overlap. Sufficient mapping and equal prediction settings are required. Exploratory thresholds are not target-specific calibration."}
            </Hint>
            <select
              aria-label={zh ? "关联方式" : "Association sensitivity"}
              value={choice}
              onChange={(e) => {
                setError("");
                setChoice(e.target.value);
                setOptions(preset(e.target.value));
              }}
            >
              <option value="balanced">
                {zh ? "常规比较" : "Balanced comparison"}
              </option>
              <option value="strict">
                {zh ? "严格比较" : "Strict comparison"}
              </option>
              <option value="exploratory">
                {zh ? "扩大探索范围" : "Broader exploration"}
              </option>
            </select>
          </label>
          <button
            className="secondary-button"
            type="button"
            aria-pressed={expert}
            onClick={() => setExpert(!expert)}
          >
            {expert
              ? zh
                ? "返回选择模式"
                : "Return to guided choices"
              : zh
                ? "专家阈值"
                : "Expert thresholds"}
          </button>
          {expert &&
            (Object.keys(labels) as (keyof SiteOptions)[]).map((k) => (
              <label className="field" key={k}>
                {labels[k][zh ? 0 : 1]}
                <input
                  type="number"
                  required
                  min={schema.properties[k].minimum}
                  max={schema.properties[k].maximum}
                  step={k === "minimum_shared_residues" ? 1 : "any"}
                  value={Number.isFinite(options[k]) ? options[k] : ""}
                  onChange={(e) => {
                    setError("");
                    setOptions((v) => ({
                      ...v,
                      [k]: e.target.value === "" ? NaN : Number(e.target.value),
                    }));
                  }}
                />
              </label>
            ))}
          <button
            className="primary-button"
            type="submit"
            disabled={
              selectedJobs.length < 2 ||
              busy ||
              loading ||
              Object.values(options).some((v) => !Number.isFinite(v))
            }
          >
            {busy
              ? zh
                ? "关联中…"
                : "Associating…"
              : zh
                ? "比较并保存位点集合"
                : "Compare and save site set"}
          </button>
        </fieldset>
      </form>
      <p className="field-help">
        {zh
          ? "选择至少两个不同受体的成功口袋任务，每个受体一个；使用对齐后的具体版本，不会自动运行新预测。"
          : "Select successful pocket tasks from at least two aligned receptor versions, one per member. No new predictions are dispatched."}
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <button
        className="secondary-button"
        type="button"
        disabled={busy || loading}
        onClick={() => {
          setError("");
          setReload((v) => v + 1);
        }}
      >
        {zh ? "刷新口袋任务与集合" : "Refresh pocket tasks and sets"}
      </button>
      {!loading && !error && !sets.length && (
        <p role="status">
          {zh ? "尚无保存的位点集合。" : "No saved site sets yet."}
        </p>
      )}
      {sets.length > 0 && (
        <label className="field">
          {zh ? "已保存的位点集合" : "Saved site sets"}
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">{zh ? "选择查看" : "Choose a set"}</option>
            {sets.map((s, index) => (
              <option value={s.id} key={s.id}>
                {historyChoiceLabel(s.request.name, index, zh, s.created_at)}
              </option>
            ))}
          </select>
        </label>
      )}
      {saved && (
        <SiteResults key={saved.id} value={saved} language={language} />
      )}
    </section>
  );
}
