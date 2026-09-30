import { useCallback, useEffect, useState } from "react";
import { api, request } from "../api";
import type { Job, Language } from "../types";
import type { AssetKind } from "../operations/types";
import { PropertyForm } from "../operations/PropertyForm";
import { StructureViewer } from "../viewer/StructureViewer";
import { RelationshipGraph } from "./RelationshipGraph";
import {
  objectLabels,
  type ObjectKind,
  type ResearchGraph,
  type ScientificObject,
} from "./types";
import "./research.css";
import { ObjectInspector } from "./ObjectInspector";

export function ResearchWorkspace({
  language,
  onEdit,
  onJob,
  onCreated,
}: {
  language: Language;
  onEdit(value: ScientificObject): void;
  onJob(id: string): void;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh";
  const [graph, setGraph] = useState<ResearchGraph | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [uploadKind, setUploadKind] = useState<ObjectKind>("molecule"),
    [properties, setProperties] = useState<ScientificObject | null>(null);
  const [label, setLabel] = useState(""),
    [notes, setNotes] = useState(""),
    [rating, setRating] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const value = await request<ResearchGraph>("/research/graph", { signal });
      if (!signal?.aborted) setGraph(value);
    } catch (e) {
      if (!signal?.aborted) setError(String(e));
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  const node = graph?.nodes.find((n) => n.id === selected),
    object = node?.object;
  useEffect(() => {
    setLabel(object?.label ?? "");
    setNotes(object?.notes ?? "");
    setRating(object?.rating ?? 0);
    setProperties(null);
  }, [object?.id]);
  async function register(
    assetId: string,
    kind: ObjectKind,
    name: string,
    parent?: ScientificObject,
  ) {
    const value = await api.post<ScientificObject>("/research/objects", {
      asset_id: assetId,
      kind,
      label: name,
      record: parent?.reference.record ?? 0,
      conformer: parent?.reference.conformer ?? 0,
      parent_id: parent?.id ?? null,
      relation: "edited_from",
      notes: parent ? notes : "",
      rating: parent ? rating : 0,
    });
    await load();
    setSelected("object:" + value.id);
    return value;
  }
  async function mutate(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(
        zh
          ? "已保存，原始版本仍保留。"
          : "Saved. The original version is preserved.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="research-workspace">
      <header className="research-heading">
        <span className="eyebrow">CONNECTED RESEARCH</span>
        <h1>
          {zh ? "科学资产与关系网络" : "Scientific assets & relationships"}
        </h1>
        <p>
          {zh
            ? "结构、分子、序列和计算结果在同一个研究空间中。点击资产，查看它的来源、修改版本和下游任务，再选择下一步。"
            : "Structures, molecules, sequences and results share one research space. Select an asset to inspect its origin, versions and downstream tasks, then choose the next step."}
        </p>
      </header>
      <div className="editor-toolbar">
        <button onClick={() => void load()} disabled={busy}>
          {zh ? "刷新关系" : "Refresh relationships"}
        </button>
        <label>
          {zh ? "上传资产类型" : "Upload type"}{" "}
          <select
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value as ObjectKind)}
          >
            {(["molecule", "structure", "sequence"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {objectLabels[kind][zh ? 0 : 1]}
              </option>
            ))}
          </select>
        </label>
        <label className="file-choice">
          {zh ? "上传并登记" : "Upload & register"}
          <input
            type="file"
            disabled={busy}
            accept={
              uploadKind === "molecule"
                ? ".sdf,.mol,.mol2"
                : uploadKind === "structure"
                  ? ".pdb,.cif"
                  : ".fasta,.fa"
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void mutate(async () => {
                  const kind: AssetKind =
                    uploadKind === "molecule"
                      ? "ligand"
                      : uploadKind === "structure"
                        ? "structure"
                        : "sequences";
                  const asset = await api.upload(file, kind);
                  await register(asset.id, uploadKind, file.name);
                });
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}{" "}
          <button onClick={() => void load()}>{zh ? "重试" : "Retry"}</button>
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!graph && !error && (
        <p role="status">
          {zh ? "正在读取资产关系…" : "Loading asset relationships…"}
        </p>
      )}
      {graph && !graph.nodes.length && (
        <div className="editor-empty">
          <h2>
            {zh
              ? "从第一份研究资产开始"
              : "Start with your first research asset"}
          </h2>
          <p>
            {zh
              ? "上传已有结构或分子，或者将计算结果保存为资产，关系会自动出现。"
              : "Upload a structure or molecule, or save a task result as an asset. Its relationships appear automatically."}
          </p>
        </div>
      )}
      {graph && graph.nodes.length > 0 && (
        <>
          <RelationshipGraph
            graph={graph}
            selected={selected}
            language={language}
            onSelect={setSelected}
          />
          {graph.truncated && (
            <p className="notice">
              {zh
                ? "当前显示最近的资产与任务，以及关联来源。更早资产仍保留，可通过资产分页接口访问。"
                : "Showing recent assets/tasks and their referenced origins. Older records are preserved and accessible through paginated asset APIs."}
            </p>
          )}
          <div className="research-columns">
            <section className="setup-card">
              <label className="field">
                {zh ? "查找资产或任务" : "Find an asset or task"}
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <ul className="research-node-list">
                {graph.nodes
                  .filter((n) =>
                    `${n.label} ${n.kind} ${n.operation ?? ""}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        className={selected === n.id ? "selected" : ""}
                        onClick={() => setSelected(n.id)}
                      >
                        <small>{objectLabels[n.kind]?.[zh ? 0 : 1]}</small>
                        <strong>{n.label}</strong>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
            <ObjectInspector
              node={node}
              graph={graph}
              selected={selected}
              language={language}
              busy={busy}
              label={label}
              notes={notes}
              rating={rating}
              setLabel={setLabel}
              setNotes={setNotes}
              setRating={setRating}
              onEdit={onEdit}
              onProperties={setProperties}
              onSelect={setSelected}
              onJob={onJob}
              mutate={mutate}
              register={register}
            />
          </div>
          {properties && (
            <PropertyForm
              key={properties.id}
              language={language}
              onCreated={onCreated}
              initialFile={properties.reference.asset_id}
              scientificInput={properties.reference}
            />
          )}
          {object && ["structure", "pocket"].includes(object.kind) && (
            <StructureViewer
              urls={[`/api/assets/${object.reference.asset_id}`]}
              language={language}
            />
          )}
        </>
      )}
    </section>
  );
}
