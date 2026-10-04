import { ResearchHandoff } from "../guided/ResearchHandoff";
import "./states.css";
import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import { artifactUrl, request } from "../api";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "../docking/DockingForm";
import { StateCollectionPreview } from "./StateCollectionPreview";
import type { MoleculeRef } from "../research/types";
import type { StateResult, StateSet } from "./types";

export function StateResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: StateResult;
  language: Language;
}) {
  const zh = language === "zh",
    [sets, setSets] = useState<StateSet[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<MoleculeRef | null>(null),
    [next, setNext] = useState<"properties" | "docking" | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setSets([]);
    setSelected(null);
    setNext(null);
    void request<StateSet[]>(
      `/research/state-sets?source_job=${encodeURIComponent(job.id)}`,
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) setSets(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [job.id]);
  if (selected && next)
    return (
      <ResearchHandoff language={language} onBack={() => setNext(null)}>
        {next === "properties" ? (
          <PropertyForm
            language={language}
            initialFile={selected.asset_id}
            scientificInput={selected}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        ) : (
          <DockingForm
            mode="dock"
            language={language}
            initialLigand={selected}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        )}
      </ResearchHandoff>
    );
  return (
    <section
      className="molecular-state-results"
      aria-busy={loading}
      aria-label={
        zh ? "分子状态与构象结果" : "Molecular-state and conformer results"
      }
    >
      <p>
        {zh ? "化学状态" : "Chemical states"}: {data.states.length} ·{" "}
        {zh ? "游离三维构象" : "Free 3D conformers"}: {data.conformers.length}
      </p>
      <p className="field-help">
        {zh
          ? "状态编号不是优势状态排名；能量只在同一化学状态、同一力场内比较。新构象不是结合姿势。"
          : "State numbers are not population ranks. Compare energies only within one chemical state and force field. New conformers are not binding poses."}
      </p>
      {data.coverage.budget_limited && (
        <p role="status">
          {zh
            ? "枚举达到部分预算上限，不能视为穷尽所有状态。"
            : "Enumeration reached a budget limit; it is not exhaustive."}
        </p>
      )}
      <a href={artifactUrl(job.id, data.state_artifact)} download>
        {zh ? "下载化学状态 SDF" : "Download state SDF"}
      </a>
      {data.conformers.length > 0 && (
        <>
          {" "}
          ·{" "}
          <a href={artifactUrl(job.id, data.conformer_artifact)} download>
            {zh ? "下载构象 SDF" : "Download conformer SDF"}
          </a>
        </>
      )}
      {data.coverage.rejected > 0 && (
        <p role="status">
          {zh
            ? "已排除改变原有指定构型的候选："
            : "Candidates excluded for changes to defined source stereochemistry: "}
          {data.coverage.rejected}
        </p>
      )}
      {data.coverage.protonation_rejected > 0 && (
        <p role="status">
          {zh
            ? "质子化方法排除的无效候选："
            : "Invalid candidates excluded by the protonation method: "}
          {data.coverage.protonation_rejected}
        </p>
      )}
      {loading && !error && (
        <p role="status">
          {zh
            ? "正在读取已登记集合；可在任务文件中检查原始输出。"
            : "Loading the indexed collection; inspect task files for original outputs."}
        </p>
      )}
      {!loading && !error && sets.length === 0 && (
        <p role="status">
          {zh
            ? "可直接查看和下载原始结果；后续任务的历史材料选择将在保存后提供。"
            : "Original results can be previewed and downloaded; saved materials will enable history selection for later tasks."}
        </p>
      )}
      <StateCollectionPreview
        job={job}
        data={data}
        sets={sets}
        language={language}
        onUse={(reference, kind) => {
          setSelected(reference);
          setNext(kind);
        }}
      />
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {message && (
        <p role="status">
          {zh ? "已创建任务：" : "Created task: "}
          {message}
        </p>
      )}
    </section>
  );
}
