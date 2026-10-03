import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Job, Language } from "../types";
import type { AssetKind } from "../operations/types";
import { PropertyForm } from "../operations/PropertyForm";
import { StructureViewer } from "../viewer/StructureViewer";
import { RelationshipGraph } from "./RelationshipGraph";
import { objectLabels, type ObjectKind, type ScientificObject } from "./types";
import "./research.css";
import { ObjectInspector } from "./ObjectInspector";
import { useResearchGraph } from "./useResearchGraph";
import { researchGraphForDisplay } from "../presentation/research-graph";
import { isResearchFile } from "../presentation/research-files";
import { visibleAssetNodes, type AssetFilter } from "./asset-list";

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
  const {
    graph: sourceGraph,
    selected,
    setSelected,
    error,
    setError,
    indexing,
    hasOlder,
    load,
    older,
    select,
  } = useResearchGraph();
  const graph = sourceGraph ? researchGraphForDisplay(sourceGraph) : null;
  const [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("research"),
    [page, setPage] = useState(0);
  const rows = visibleAssetNodes(graph?.nodes ?? [], assetFilter, query),
    pageSize = 30;
  const [uploadKind, setUploadKind] = useState<ObjectKind>("molecule"),
    [properties, setProperties] = useState<ScientificObject | null>(null);
  const [label, setLabel] = useState(""),
    [notes, setNotes] = useState(""),
    [rating, setRating] = useState(0);
  const versionIntent = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const mutationRunning = useRef(false);
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
    const body = {
      asset_id: assetId,
      kind,
      label: name,
      record: parent?.reference.record ?? 0,
      conformer: parent?.reference.conformer ?? 0,
      parent_id: parent?.id ?? null,
      relation: parent ? "edited_from" : "derived_from",
      notes: parent ? notes : "",
      rating: parent ? rating : 0,
    };
    const fingerprint = JSON.stringify(body);
    if (versionIntent.current?.fingerprint !== fingerprint)
      versionIntent.current = { fingerprint, key: crypto.randomUUID() };
    const value = await api.post<ScientificObject>(
      "/research/objects",
      body,
      versionIntent.current.key,
    );
    await load();
    setSelected("object:" + value.id);
    return value;
  }
  async function mutate(fn: () => Promise<unknown>, successMessage?: string) {
    if (mutationRunning.current) return;
    mutationRunning.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(
        successMessage ??
          (zh
            ? "已保存，原始版本仍保留。"
            : "Saved. The original version is preserved."),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      mutationRunning.current = false;
      setBusy(false);
    }
  }

  if (properties)
    return (
      <section className="task-workspace is-input">
        <button
          className="tool-back-button"
          onClick={() => setProperties(null)}
        >
          {zh ? "← 返回研究资产" : "← Back to assets"}
        </button>
        <PropertyForm
          key={properties.id}
          language={language}
          onCreated={onCreated}
          initialFile={properties.reference.asset_id}
          scientificInput={properties.reference}
        />
      </section>
    );
  return (
    <section className="research-workspace">
      <h1 className="sr-only">
        {zh ? "科学研究资产网络" : "Scientific assets & relationships"}
      </h1>
      <div className="editor-toolbar">
        <button onClick={() => void load()} disabled={busy}>
          {zh ? "刷新" : "Refresh"}
        </button>
        {selected && (
          <button onClick={() => setSelected(null)}>
            {zh ? "取消选择" : "Clear selection"}
          </button>
        )}
        <label>
          {zh ? "材料类型" : "Upload type"}{" "}
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
          {zh ? "上传材料" : "Upload material"}
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
      {indexing
        .filter(
          (item) =>
            item.state === "partial" &&
            item.errors.some((e) => isResearchFile(e.artifact)),
        )
        .map((item) => (
          <div className="notice" role="alert" key={item.job_id}>
            <p>
              {zh
                ? "计算产物仍保留，以下文件登记为共享资产时遇到问题："
                : "Task outputs are preserved, but these files could not be registered as shared assets:"}
            </p>
            <ul>
              {item.errors
                .filter((e) => isResearchFile(e.artifact))
                .map((e, i) => (
                  <li key={i}>
                    {e.artifact}: {e.reason}
                  </li>
                ))}
            </ul>
            <button
              disabled={busy}
              onClick={() =>
                void mutate(async () => {
                  await api.post(`/jobs/${item.job_id}/index-assets`, {});
                  await load();
                })
              }
            >
              {zh ? "重新登记产物" : "Retry output registration"}
            </button>
          </div>
        ))}
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
          <div className="research-columns">
            <section className="setup-card">
              <label className="field">
                {zh ? "查找资产或任务" : "Find an asset or task"}
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="field">
                {zh ? "显示内容" : "Show"}
                <select
                  value={assetFilter}
                  onChange={(e) => {
                    setAssetFilter(e.target.value as AssetFilter);
                    setPage(0);
                  }}
                >
                  {(
                    [
                      "research",
                      "molecule",
                      "structure",
                      "sequence",
                      "file",
                      "task",
                      "all",
                    ] as const
                  ).map((id, i) => (
                    <option key={id} value={id}>
                      {
                        (zh
                          ? [
                              "研究结果",
                              "分子",
                              "蛋白与复合物",
                              "序列",
                              "原始文件",
                              "任务",
                              "全部",
                            ]
                          : [
                              "Research results",
                              "Molecules",
                              "Proteins & complexes",
                              "Sequences",
                              "Source files",
                              "Tasks",
                              "All",
                            ])[i]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <ul
                data-asset-view={assetFilter}
                className="research-node-list"
                aria-label={zh ? "资产与任务" : "Assets and tasks"}
              >
                {rows.slice(page * pageSize, (page + 1) * pageSize).map((n) => (
                  <li key={n.id}>
                    <button
                      className={selected === n.id ? "selected" : ""}
                      aria-label={`${objectLabels[n.kind]?.[zh ? 0 : 1]}: ${n.label}`}
                      onClick={() => void select(n.id)}
                    >
                      <small>{objectLabels[n.kind]?.[zh ? 0 : 1]}</small>
                      <strong>{n.label}</strong>
                    </button>
                  </li>
                ))}
              </ul>

              {!rows.length && (
                <p className="field-help">
                  {zh
                    ? "没有符合条件的资产，请切换显示内容或搜索词。"
                    : "No matching assets. Change the view or search."}
                </p>
              )}
              {rows.length > pageSize && (
                <div className="asset-pagination">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {zh ? "上一页" : "Previous"}
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(rows.length / pageSize)}
                  </span>
                  <button
                    disabled={(page + 1) * pageSize >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {zh ? "下一页" : "Next"}
                  </button>
                </div>
              )}
              {graph.truncated && hasOlder && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      older,
                      zh ? "已加载更早资产。" : "Older assets loaded.",
                    )
                  }
                >
                  {zh ? "加载更早资产" : "Load older assets"}
                </button>
              )}
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
              onSelect={(id) => void select(id)}
              onJob={onJob}
              mutate={mutate}
              register={register}
            />
          </div>
          <details className="research-relationships">
            <summary>
              {zh ? "查看资产关系图" : "Show asset relationships"}
            </summary>
            <RelationshipGraph
              graph={graph}
              selected={selected}
              language={language}
              onSelect={(id) => void select(id)}
            />
          </details>
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
