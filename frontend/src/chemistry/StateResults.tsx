import "./states.css";
import { useEffect, useState } from "react";
import type { Job, Language } from "../types";
import { artifactUrl, request } from "../api";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "../docking/DockingForm";
import { StructureViewer } from "../viewer/StructureViewer";
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
            ? "此任务尚未登记可复用集合，请在任务资产登记中检查错误并重试。原始文件仍可下载。"
            : "No reusable collection was indexed. Check task asset indexing errors and retry; original files remain downloadable."}
        </p>
      )}
      {sets
        .flatMap((set) => set.members)
        .map((member) => (
          <details
            className="molecular-state-card"
            key={`${member.reference.asset_id}:${member.reference.record}`}
          >
            <summary>
              {zh ? "状态" : "State"} {member.evidence.index + 1} ·{" "}
              {zh ? "电荷" : "Charge"} {member.evidence.charge} ·{" "}
              {member.evidence.formula}
            </summary>
            <p className="molecular-state-smiles">{member.evidence.smiles}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setSelected(member.reference);
                setNext("properties");
              }}
            >
              {zh ? "计算此状态性质" : "Calculate this state's properties"}
            </button>
            {member.conformers.length === 0 && (
              <p>
                {zh
                  ? "此状态没有可用三维构象；请检查嵌入或力场参数记录。"
                  : "This state has no usable 3D conformer; inspect embedding or force-field records."}{" "}
                · {member.evidence.conformer_status}
              </p>
            )}
            {member.conformers.map((c) => (
              <div key={c.reference.record} className="editor-toolbar">
                <button
                  type="button"
                  className="secondary-button"
                  aria-pressed={
                    selected?.asset_id === c.reference.asset_id &&
                    selected?.record === c.reference.record
                  }
                  onClick={() => {
                    setSelected(c.reference);
                    setNext(null);
                  }}
                >
                  {zh ? "构象" : "Conformer"} {c.evidence.native_conformer + 1}{" "}
                  ·{" "}
                  {c.evidence.energy === null
                    ? zh
                      ? "未计算能量"
                      : "Energy not computed"
                    : `${c.evidence.energy.toFixed(3)} kcal/mol`}{" "}
                  ·{" "}
                  {c.evidence.converged === null
                    ? zh
                      ? "未最小化"
                      : "Not minimized"
                    : c.evidence.converged
                      ? zh
                        ? "收敛"
                        : "Converged"
                      : zh
                        ? "未收敛"
                        : "Not converged"}
                </button>
              </div>
            ))}
          </details>
        ))}
      {selected && next === null && (
        <div className="editor-toolbar">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setNext("properties")}
          >
            {zh ? "计算性质" : "Calculate properties"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setNext("docking")}
          >
            {zh ? "用于寻找结合姿势" : "Use for binding-pose search"}
          </button>
        </div>
      )}
      {selected && next === null && (
        <StructureViewer
          urls={[
            artifactUrl(
              job.id,
              data.conformers.find((c) => c.record === selected.record)
                ?.artifact ?? data.conformer_artifact,
            ),
          ]}
          language={language}
        />
      )}
      {selected && next === "properties" && (
        <PropertyForm
          key={`${selected.asset_id}:${selected.record}`}
          language={language}
          initialFile={selected.asset_id}
          scientificInput={selected}
          onCreated={(j) => setMessage(j.id)}
        />
      )}

      {selected && next === "docking" && (
        <DockingForm
          mode="dock"
          language={language}
          initialLigand={selected}
          onCreated={(j) => setMessage(j.id)}
        />
      )}
      <details>
        <summary>{zh ? "方法与版本" : "Methods and versions"}</summary>
        <p>
          {Object.entries(data.versions)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      </details>
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
