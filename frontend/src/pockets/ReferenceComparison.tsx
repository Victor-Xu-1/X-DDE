import { useEffect, useMemo, useRef, useState } from "react";
import { api, artifactUrl, request } from "../api";
import { reviewedExample } from "../examples/metadata";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import type { Site } from "./types";
import { compareReference, isReferenceJob } from "./reference-comparison";

export interface ReferenceSession {
  jobs: Job[] | null;
  selected: string;
  confirmed: boolean;
  loaded: { job: Job; result: OperationResult } | null;
  limited: boolean;
}
/** Read existing results only; no task, asset or coordinate is created here. */
export function ReferenceComparison({
  protein,
  site,
  language,
  onOverlay,
  onGenerate,
  onDock,
  initialSession,
  onSession,
}: {
  protein: MoleculeRef;
  site: Site;
  language: Language;
  onOverlay(value: string | null): void;
  onGenerate(ligand: MoleculeRef): void;
  onDock(ligand: MoleculeRef): void;
  initialSession?: ReferenceSession | null;
  onSession?(value: ReferenceSession): void;
}) {
  const zh = language === "zh";
  const [jobs, setJobs] = useState<Job[] | null>(initialSession?.jobs ?? null);
  const [selected, setSelected] = useState(initialSession?.selected ?? "");
  const [confirmed, setConfirmed] = useState(
    initialSession?.confirmed ?? false,
  );
  const [loaded, setLoaded] = useState<{
    job: Job;
    result: OperationResult;
  } | null>(initialSession?.loaded ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limited, setLimited] = useState(initialSession?.limited ?? false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    onSession?.({ jobs, selected, confirmed, loaded, limited });
  }, [jobs, selected, confirmed, loaded, limited, onSession]);
  const comparison = useMemo(
    () =>
      loaded && confirmed
        ? compareReference(protein, site, loaded.job, loaded.result)
        : null,
    [protein, site, loaded, confirmed],
  );
  useEffect(() => {
    onOverlay(
      comparison && loaded
        ? artifactUrl(loaded.job.id, comparison.referenceArtifact)
        : null,
    );
    return () => onOverlay(null);
  }, [comparison?.referenceArtifact, loaded?.job.id, onOverlay]);

  async function findReferences() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setLoaded(null);
    setConfirmed(false);
    onOverlay(null);
    try {
      const list: Job[] = [];
      let more = false;
      for (let offset = 0; offset < 500; offset += 100) {
        const page = await request<Job[]>(`/jobs?limit=100&offset=${offset}`, {
          signal: controller.signal,
        });
        if (!Array.isArray(page)) throw new Error("Invalid task list");
        list.push(...page.filter((job) => isReferenceJob(job, protein)));
        more = page.length === 100;
        if (!more) break;
      }
      // The fixed sample is deliberately not added to the user's task history.
      try {
        const info = await request<unknown>("/examples/diffsbdd.pocket", {
          signal: controller.signal,
        });
        if (reviewedExample(info, "diffsbdd.pocket") && info.pin) {
          const job = await request<Job>(`/jobs/${info.pin.job_id}`, {
            signal: controller.signal,
          });
          if (job.id === info.pin.job_id && isReferenceJob(job, protein))
            list.unshift(job);
        }
      } catch (failure) {
        if (controller.signal.aborted) throw failure;
      }
      if (controller.signal.aborted) return;
      const unique = [...new Map(list.map((job) => [job.id, job])).values()];
      setJobs(unique);
      setSelected(unique[0]?.id ?? "");
      setLimited(more);
    } catch {
      if (!controller.signal.aborted)
        setError(
          zh
            ? "无法读取参考口袋任务，请重试。"
            : "Could not load reference pocket tasks. Try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function inspect() {
    const job = jobs?.find((value) => value.id === selected);
    if (!job || !confirmed) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setLoaded(null);
    onOverlay(null);
    try {
      const result = await api.result(job.id, controller.signal);
      if (!compareReference(protein, site, job, result))
        throw new Error("Reference data cannot be compared");
      if (!controller.signal.aborted) setLoaded({ job, result });
    } catch {
      if (!controller.signal.aborted)
        setError(
          zh
            ? "参考结果缺失、来源不一致或残基编号无法明确对应，无法比较。"
            : "The reference result is missing, has mismatched provenance or ambiguous residue identities.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section
      aria-label={zh ? "参考区域比较" : "Reference region comparison"}
      className="pocket-reference-comparison"
    >
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={findReferences}
      >
        {busy
          ? zh
            ? "读取中…"
            : "Loading…"
          : zh
            ? "比较参考区域"
            : "Compare reference region"}
      </button>
      {jobs &&
        (jobs.length ? (
          <>
            <label className="field">
              {zh ? "参考口袋检查" : "Reference pocket inspection"}
              <select
                value={selected}
                onChange={(event) => {
                  active.current?.abort();
                  setBusy(false);
                  setSelected(event.target.value);
                  setLoaded(null);
                  setConfirmed(false);
                  setError("");
                  onOverlay(null);
                }}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.request.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.target.checked);
                  setLoaded(null);
                  onOverlay(null);
                }}
              />{" "}
              {zh
                ? "我已核对参考配体和受体位于同一坐标系"
                : "I verified that the reference ligand and receptor share the same coordinate frame"}
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={!confirmed || busy}
              onClick={inspect}
            >
              {zh ? "查看重叠" : "View overlap"}
            </button>
            {limited && (
              <p>
                {zh
                  ? "仅搜索最近 500 项任务。"
                  : "Only the most recent 500 tasks were searched."}
              </p>
            )}
          </>
        ) : (
          <p>
            {zh
              ? "没有找到使用同一受体的已完成参考口袋检查。"
              : "No completed reference pocket inspection uses this receptor."}
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
      {comparison && loaded && (
        <div role="status">
          <p>
            {zh ? "参考区域残基" : "Reference-region residues"}:{" "}
            {comparison.referenceCount} ·{" "}
            {zh ? "所选预测口袋重叠" : "Overlap with selected predicted pocket"}
            : {comparison.overlap.length}
          </p>
          {comparison.overlap.length > 0 && (
            <p>{comparison.overlap.join(", ")}</p>
          )}
          <p className="field-help">
            {zh
              ? "这是两项任务报告的残基集合比较；参考区域的定义范围见原任务，不代表结合证据或亲和力。"
              : "This compares the residue sets reported by the two tasks. See the source task for the reference region definition; overlap is not binding evidence or affinity."}
          </p>
          <a href={`/#task=${encodeURIComponent(loaded.job.id)}`}>
            {zh ? "查看参考口袋结果" : "View source pocket result"}
          </a>
          <div className="pocket-next-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onGenerate(comparison.ligand)}
            >
              {zh ? "以参考区域生成分子" : "Generate around reference"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onDock(comparison.ligand)}
            >
              {zh ? "以参考区域探索结合模式" : "Dock around reference"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
