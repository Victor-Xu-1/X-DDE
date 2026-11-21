import { FollowupBackendControl } from "../utilities/TaskBackendControl";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import type { Job, Language } from "../types";
import type { AssetKind } from "../operations/types";
import { PropertyForm } from "../operations/PropertyForm";
import { RelationshipGraph } from "./RelationshipGraph";
import { objectLabels, type ObjectKind, type ScientificObject } from "./types";
import "./research.css";
import { ObjectInspector } from "./ObjectInspector";
import { useResearchGraph } from "./useResearchGraph";
import { researchGraphForDisplay } from "../presentation/research-graph";
import { isResearchFile } from "../presentation/research-files";
import { visibleAssetNodes, type AssetFilter } from "./asset-list";
import { assetContext } from "./asset-context";
import { useResearchRegistration } from "./useResearchRegistration";
import { PoseSession } from "../viewer/PoseSession";
import type { ReactNode } from "react";
import { useResearchFileNavigation } from "./useResearchFileNavigation";
import { ResearchWorkspaceExpansionExit } from "./ResearchWorkspaceExpansionExit";
import {
  ResearchWorkspaceFileToolbar,
  type ResearchUploadKind,
} from "./ResearchWorkspaceFileToolbar";
import "./research-file-navigation.css";

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
  const fileContext = useId();
  const fileLibrary = useRef<HTMLElement>(null);
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
    selectionIntent,
    selectSaved,
    retainSaved,
  } = useResearchGraph();
  const graph = sourceGraph ? researchGraphForDisplay(sourceGraph) : null;
  const [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("research"),
    [page, setPage] = useState(0);
  const rows = visibleAssetNodes(graph?.nodes ?? [], assetFilter, query),
    pageSize = 30;
  const [properties, setProperties] = useState<ScientificObject | null>(null);
  const [uploadKind, setUploadKind] = useState<ResearchUploadKind>("molecule");
  const [propertyOrigin, setPropertyOrigin] = useState<string | null>(null);
  const [label, setLabel] = useState(""),
    [notes, setNotes] = useState(""),
    [rating, setRating] = useState(0);
  const mutationRunning = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const node = graph?.nodes.find((n) => n.id === selected),
    object = node?.object;
  const navigation = useResearchFileNavigation(node?.id);
  function openNode(id: string, button?: HTMLButtonElement) {
    navigation.open(button);
    void select(id);
  }
  useEffect(() => {
    setLabel(object?.label ?? "");
    setNotes(object?.notes ?? "");
    setRating(object?.rating ?? 0);
    setProperties(null);
  }, [object?.id]);
  const register = useResearchRegistration({
    notes,
    rating,
    selectionIntent,
    load,
    selectSaved,
    retainSaved,
  });
  async function mutate(fn: () => Promise<unknown>, successMessage?: string) {
    if (mutationRunning.current) return;
    mutationRunning.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      if (!mounted.current) return;
      setMessage(
        successMessage ??
          (zh
            ? "已保存，原始版本仍保留。"
            : "Saved. The original version is preserved."),
      );
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error &&
            e.message.startsWith("The saved version does not match")
            ? e.message
            : "The research action could not be confirmed. Retry the same action or choose another material.",
        );
    } finally {
      mutationRunning.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const poseUrl =
    object?.kind === "molecule" && object.reference.conformer === 0
      ? `/api/assets/${encodeURIComponent(object.reference.asset_id)}`
      : null;
  const poseFrame = {
    urls: poseUrl ? [poseUrl] : [],
    records: poseUrl ? [object!.reference.record] : undefined,
    molecularSource: poseUrl
      ? { url: poseUrl, record: object!.reference.record }
      : undefined,
  };
  const wrap = (content: ReactNode) => (
    <PoseSession frame={poseFrame}>{content}</PoseSession>
  );
  if (properties && propertyOrigin === node?.id)
    return wrap(
      <section className="task-workspace is-input">
        <button
          className="tool-back-button"
          onClick={() => setProperties(null)}
        >
          {zh ? "← 返回研究资产" : "← Back to assets"}
        </button>
        <FollowupBackendControl language={language} capability={"properties"} />
        <PropertyForm
          key={properties.id}
          language={language}
          onCreated={onCreated}
          initialFile={properties.reference.asset_id}
          scientificInput={properties.reference}
        />
      </section>,
    );
  function uploadFile(file: File, kind: ObjectKind, assetKind: AssetKind) {
    void mutate(async () => {
      const intent = selectionIntent();
      const asset = await api.upload(file, assetKind);
      await register(asset.id, kind, file.name, undefined, {
        intent,
        reveal: () => {
          if (mounted.current) navigation.open();
        },
      });
    });
  }
  return wrap(
    <section className="research-workspace" data-file-pane={navigation.pane}>
      <h1 className="sr-only">{zh ? "研究文件" : "Research files"}</h1>
      {error && (
        <p role="alert" className="error-box">
          {error ===
          "Research files could not be refreshed. Retry to reconnect."
            ? zh
              ? "暂时无法刷新研究文件，请重试连接。"
              : error
            : error ===
                "The selected material could not be refreshed. Retry to reconnect."
              ? zh
                ? "暂时无法刷新所选材料，请重试连接。"
                : error
              : error.startsWith("The saved version does not match")
                ? zh
                  ? "保存回复与确认的材料不一致，请重新选择原始材料。"
                  : error
                : zh
                  ? "未能确认研究操作，可重试同一次操作或选择其他材料。"
                  : error}{" "}
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
                    {e.artifact}:{" "}
                    {zh
                      ? "暂时无法登记为材料，请核对原始文件后重试。"
                      : "Could not register this material. Check the original file and retry."}
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
      <StructureWorkbench
        toolbar={
          <ResearchWorkspaceExpansionExit
            language={language}
            onClose={() => {
              const visible = [
                navigation.search.current,
                navigation.preview.current,
                fileLibrary.current?.querySelector("select"),
              ].find((control) => control?.getClientRects().length);
              visible?.focus({ preventScroll: true });
            }}
          />
        }
        preview={graph?.nodes.length ? (
          <section
            className="research-file-inspection"
            ref={navigation.preview}
            tabIndex={-1}
            aria-label={zh ? "研究文件详情" : "Research file details"}
          >
            <div className="research-file-preview-actions">
              <button
                type="button"
                className="secondary-button research-file-back"
                onClick={navigation.back}
              >
                {zh ? "返回文件列表" : "Back to files"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void load()}
                disabled={busy}
              >
                {zh ? "刷新" : "Refresh"}
              </button>
            </div>
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
              onProperties={(value) => {
                setPropertyOrigin(node?.id ?? null);
                setProperties(value);
              }}
              onSelect={openNode}
              onJob={onJob}
              mutate={mutate}
              register={register}
            />
          </section>
        ) : null}
      >
        <section
          className="setup-card research-file-library"
          aria-label={zh ? "研究文件库" : "Research file library"}
          ref={fileLibrary}
        >
          {graph?.nodes.length ? (
            <>
              <label className="field">
                <span className="sr-only">
                  {zh ? "查找研究文件或任务" : "Find research files or tasks"}
                </span>
                <input
                  type="search"
                  placeholder={zh ? "搜索文件或任务" : "Search files or tasks"}
                  ref={navigation.search}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="field">
                <span className="sr-only">{zh ? "显示内容" : "Show"}</span>
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
                ref={navigation.list}
                data-asset-view={assetFilter}
                className="research-node-list"
                aria-label={zh ? "资产与任务" : "Assets and tasks"}
              >
                {rows.slice(page * pageSize, (page + 1) * pageSize).map((n) => (
                  <li key={n.id}>
                    <button
                      className={selected === n.id ? "selected" : ""}
                      aria-label={`${objectLabels[n.kind]?.[zh ? 0 : 1]}: ${n.label}`}
                      aria-describedby={fileContext + n.id}
                      aria-current={selected === n.id ? true : undefined}
                      onClick={(event) => openNode(n.id, event.currentTarget)}
                    >
                      <small>{objectLabels[n.kind]?.[zh ? 0 : 1]}</small>
                      <strong>{n.label}</strong>
                      <small className="asset-context" id={fileContext + n.id}>
                        {assetContext(n, graph.nodes, language)}
                      </small>
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
                  type="button"
                  className="text-button research-file-older"
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
            </>
          ) : graph ? (
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
          ) : null}
          <ResearchWorkspaceFileToolbar
            language={language}
            busy={busy}
            kind={uploadKind}
            onKindChange={setUploadKind}
            onUpload={uploadFile}
            onRefresh={() => void load()}
            onClear={selected ? () => setSelected(null) : undefined}
          />
        </section>
      </StructureWorkbench>
      {graph && graph.nodes.length > 0 && (
        <details className="research-relationships">
          <summary>
            {zh ? "查看文件之间的关系" : "Show file relationships"}
          </summary>
          <RelationshipGraph
            graph={graph}
            selected={selected}
            language={language}
            onSelect={openNode}
          />
        </details>
      )}
    </section>,
  );
}
