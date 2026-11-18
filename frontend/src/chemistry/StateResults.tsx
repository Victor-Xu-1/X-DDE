import { ResearchHandoff } from "../guided/ResearchHandoff";
import "./states.css";
import { useEffect, useState, type ReactNode } from "react";
import { PoseSession } from "../viewer/PoseSession";
import { posePlan } from "../viewer/pose-plan";
import type { Job, Language } from "../types";
import { artifactUrl, request } from "../api";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "../docking/DockingForm";
import { StateCollectionPreview } from "./StateCollectionPreview";
import type { MoleculeRef } from "../research/types";
import type { StateResult, StateSet } from "./types";
import { stateSelection } from "./state-inspection";

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
  const [stateIndex, setState] = useState<number | undefined>(
    data.states[0]?.index,
  );
  const [nextOrigin, setNextOrigin] = useState("");
  const [record, setRecord] = useState<number | null>(null);
  const { state, nativeConformer } = stateSelection(data, stateIndex, record);
  const url = nativeConformer
    ? artifactUrl(job.id, nativeConformer.artifact)
    : null;
  const frame = {
    urls: url ? [url] : [],
    records: url ? [0] : undefined,
    molecularSource: url ? { url, record: 0 } : undefined,
    nativeArtifactSha256: nativeConformer?.artifact_sha256,
  };
  const wrap = (content: ReactNode) => (
    <PoseSession frame={frame}>{content}</PoseSession>
  );
  const origin = JSON.stringify([
    job.id,
    state?.index,
    nativeConformer?.record,
    posePlan(frame).key,
  ]);
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
  if (selected && next && nextOrigin === origin)
    return wrap(
      <ResearchHandoff
        language={language}
        onBack={() => setNext(null)}
        capability={next === "properties" ? "properties" : "gnina.dock"}
      >
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
      </ResearchHandoff>,
    );
  return wrap(
    <section
      className="molecular-state-results"
      aria-busy={loading}
      aria-label={
        zh ? "分子状态与构象结果" : "Molecular-state and conformer results"
      }
    >
      <StateCollectionPreview
        job={job}
        data={data}
        sets={sets}
        language={language}
        stateIndex={state?.index}
        record={record}
        onSelection={(index, conformer) => {
          setState(index);
          setRecord(conformer);
        }}
        onUse={(reference, kind) => {
          setNextOrigin(origin);
          setSelected(reference);
          setNext(kind);
        }}
      />
      {loading && !error && (
        <p className="field-help" role="status">
          {zh ? "正在读取已保存的研究材料…" : "Loading the indexed collection…"}
        </p>
      )}
      {!loading && !error && sets.length === 0 && (
        <p className="field-help" role="status">
          {zh
            ? "可查看和下载原始结果。保存材料后即可用于新任务。"
            : "Original results can be previewed and downloaded. Save materials to use them in a new task."}
        </p>
      )}
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
    </section>,
  );
}
