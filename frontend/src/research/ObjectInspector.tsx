import type { Language } from "../types";
import {
  edgeLabels,
  type GraphNode,
  type ObjectKind,
  type ResearchGraph,
  type ScientificObject,
} from "./types";

export function ObjectInspector({
  node,
  graph,
  selected,
  language,
  busy,
  label,
  notes,
  rating,
  setLabel,
  setNotes,
  setRating,
  onEdit,
  onProperties,
  onSelect,
  onJob,
  mutate,
  register,
}: {
  node: GraphNode | undefined;
  graph: ResearchGraph;
  selected: string | null;
  language: Language;
  busy: boolean;
  label: string;
  notes: string;
  rating: number;
  setLabel(value: string): void;
  setNotes(value: string): void;
  setRating(value: number): void;
  onEdit(value: ScientificObject): void;
  onProperties(value: ScientificObject): void;
  onSelect(value: string): void;
  onJob(id: string): void;
  mutate(fn: () => Promise<unknown>): Promise<void>;
  register(
    assetId: string,
    kind: ObjectKind,
    label: string,
    parent?: ScientificObject,
  ): Promise<ScientificObject>;
}) {
  const zh = language === "zh",
    object = node?.object;
  const related = graph.edges.filter(
    (e) => e.source === selected || e.target === selected,
  );
  return (
    <section className="setup-card">
      {node ? (
        <>
          <h2>{node.label}</h2>
          {object && (
            <>
              <p className="field-help">
                {zh
                  ? "文件来源与版本已校验；化学有效性、三维质量和实验意义需由相应科学工具确认。"
                  : "File identity and version are checked. Chemical validity, 3D quality and experimental interpretation require scientific tools."}
              </p>
              <div className="editor-toolbar">
                {object.kind === "molecule" && (
                  <>
                    <button
                      onClick={() => onEdit(object)}
                      title={
                        zh
                          ? "在 Ketcher 中打开；保存会创建新版本并保留原始分子。"
                          : "Open in Ketcher. Saving creates a new version and preserves the original."
                      }
                    >
                      {zh ? "编辑分子" : "Edit molecule"}
                    </button>
                    <button onClick={() => onProperties(object)}>
                      {zh ? "用作性质计算输入" : "Use for properties"}
                    </button>
                  </>
                )}
                <a href={`/api/assets/${object.reference.asset_id}`} download>
                  {zh ? "下载此版本" : "Download version"}
                </a>
              </div>
              <label className="field">
                {zh ? "名称" : "Name"}
                <input
                  value={label}
                  maxLength={120}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="field">
                {zh ? "研究备注" : "Research notes"}
                <textarea
                  value={notes}
                  maxLength={3000}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="field">
                {zh
                  ? "人工评价（不代表模型分数）"
                  : "Human rating (not a model score)"}
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? (zh ? "未评价" : "Unrated") : `${n} / 5`}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || !label.trim()}
                onClick={() =>
                  void mutate(() =>
                    register(
                      object.reference.asset_id,
                      object.kind,
                      label.trim(),
                      object,
                    ),
                  )
                }
              >
                {zh ? "保存备注为新版本" : "Save notes as new version"}
              </button>
            </>
          )}
          {node.kind === "file" &&
            ["ligand", "structure", "sequences", "config"].includes(
              node.asset_kind ?? "",
            ) && (
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(() =>
                    register(
                      node.asset_id!,
                      (
                        {
                          ligand: "molecule",
                          structure: "structure",
                          sequences: "sequence",
                          config: "analysis",
                        } as Record<string, ObjectKind>
                      )[node.asset_kind!],
                      node.label,
                    ),
                  )
                }
              >
                {zh ? "登记为科学资产" : "Register scientific asset"}
              </button>
            )}
          {node.job_id && (
            <button onClick={() => onJob(node.job_id!)}>
              {zh ? "查看任务与结果" : "Open task & results"}
            </button>
          )}
          <h3>{zh ? "关联来源与去向" : "Sources & downstream use"}</h3>
          {!related.length ? (
            <p>
              {zh ? "尚未被其他任务使用。" : "Not yet used by another task."}
            </p>
          ) : (
            <ul>
              {related.map((edge, i) => {
                const target =
                    edge.source === selected ? edge.target : edge.source,
                  other = graph.nodes.find((n) => n.id === target);
                return (
                  <li key={i}>
                    <span>{edgeLabels[edge.relation]?.[zh ? 0 : 1]} → </span>
                    <button onClick={() => onSelect(target)}>
                      {other?.label ?? target}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p>
          {zh
            ? "点击左侧或关系图中的资产，选择下一步。"
            : "Select an asset in the list or graph to choose its next step."}
        </p>
      )}
    </section>
  );
}
