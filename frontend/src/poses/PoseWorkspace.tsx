import { useEffect, useState } from "react";
import { useExample } from "../examples/context";
import { request } from "../api";
import { loadPages } from "../research/loadPages";
import type { StateSet } from "../chemistry/types";
import type { SiteSet } from "../sites/types";
import type { Language } from "../types";
import { PoseForm } from "./PoseForm";
import { PosePlanRun } from "./PosePlanRun";
import type { Exploration } from "./types";
import "./poses.css";
export function PoseWorkspace({
  language,
  initialSites,
  initialExplorationId,
}: {
  language: Language;
  initialSites?: SiteSet;
  initialExplorationId?: string;
}) {
  const zh = language === "zh";
  const example = useExample(),
    preset =
      example?.record?.kind === "pose_exploration" ? example.record : null;
  const selectedId = initialExplorationId;
  const [sites, setSites] = useState<SiteSet[]>(
      initialSites ? [initialSites] : preset ? [preset.sites] : [],
    ),
    [states, setStates] = useState<StateSet[]>([]),
    [plans, setPlans] = useState<Exploration[]>([]),
    [siteId, setSiteId] = useState(initialSites?.id ?? preset?.sites.id ?? ""),
    [selected, setSelected] = useState(selectedId ?? ""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      loadPages<SiteSet>("/research/site-sets", c.signal),
      loadPages<StateSet>("/research/state-sets", c.signal),
      loadPages<Exploration>("/research/pose-explorations", c.signal),
    ])
      .then(async ([s, m, p]) => {
        if (selectedId && !p.some((v) => v.id === selectedId))
          p.push(
            await request<Exploration>(
              "/research/pose-explorations/" + selectedId,
              { signal: c.signal },
            ),
          );
        if (!c.signal.aborted) {
          setSites(s);
          setStates(m);
          setPlans(p);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [selectedId, reload]);
  const site = sites.find((s) => s.id === siteId),
    plan = plans.find((p) => p.id === selected);
  return (
    <section
      className="pose-workspace"
      aria-label={
        zh ? "多受体与状态姿势探索" : "Multi-receptor/state pose exploration"
      }
      aria-busy={loading}
    >
      {loading && (
        <p role="status">
          {zh
            ? "读取位点、状态与历史计划…"
            : "Loading sites, states and plans…"}
        </p>
      )}
      {!loading && !error && !sites.length && (
        <p role="status">
          {zh
            ? "先完成受体构象对齐、为各对齐版本寻找口袋，并保存跨构象位点集合；也可复用已有集合。"
            : "Align receptors, find pockets on their aligned versions and save a cross-conformation site set, or reuse an existing set."}
        </p>
      )}
      <div className="pose-context-row">
        <label className="field">
          {zh ? "使用哪个位点集合？" : "Which site set?"}
          <select
            value={siteId}
            disabled={loading}
            onChange={(e) => {
              setSiteId(e.target.value);
              setSelected("");
            }}
          >
            <option value="">
              {zh ? "选择已有位点集合" : "Choose an existing site set"}
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.request.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={() => setReload((v) => v + 1)}
        >
          {zh ? "刷新" : "Refresh"}
        </button>{" "}
      </div>
      {site && !loading && !plan && (
        <PoseForm
          key={site.id}
          sites={site}
          states={states}
          language={language}
          initial={
            preset?.sites.id === site.id ? preset.value.request : undefined
          }
          onSaved={(p) => {
            setPlans((v) => [p, ...v.filter((old) => old.id !== p.id)]);
            setSelected(p.id);
          }}
        />
      )}
      {plans.length > 0 && (
        <details className="pose-history" open={Boolean(plan)}>
          <summary>
            {zh ? "历史探索计划" : "Historical exploration plans"}
          </summary>
          <label className="field">
            {zh ? "选择历史计划" : "Choose a historical plan"}
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{zh ? "选择计划" : "Choose a plan"}</option>
              {plans.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.request.name}
                </option>
              ))}
            </select>
          </label>
        </details>
      )}
      {plan && <PosePlanRun key={plan.id} value={plan} language={language} />}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
