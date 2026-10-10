import type { Language } from "../types";
import type { GraphNode } from "./types";
import { datasetTools } from "../datasets/catalog";

/** Human context supplements filenames without renaming scientific records. */
export function assetContext(
  node: GraphNode,
  nodes: GraphNode[],
  language: Language,
) {
  const object = node.object;
  if (!object) return "";
  const parts: string[] = [];
  const task = object.source_job
    ? nodes.find(
        (value) => value.kind === "task" && value.job_id === object.source_job,
      )
    : undefined;
  if (task) {
    const generated = /^Public native ([a-z0-9_]+)$/.exec(task.label);
    if (generated && generated[1] === task.operation) {
      const method = datasetTools.find(
        (value) => value.operation === task.operation,
      );
      parts.push(
        method?.label[language === "zh" ? 0 : 1] ??
          (language === "zh" ? "研究计算" : "Computed study"),
      );
    } else if (
      task.operation === "molecule_minimize" &&
      task.label === "Initial optimized 3D preview"
    ) {
      parts.push(
        language === "zh" ? "已计算三维构象" : "Calculated 3D conformer",
      );
    } else {
      parts.push(task.label);
    }
  }
  if (object.kind === "molecule")
    parts.push(
      language === "zh"
        ? `记录 ${object.reference.record + 1}`
        : `Record ${object.reference.record + 1}`,
    );
  const date = new Date(object.created_at);
  if (Number.isFinite(date.getTime()))
    parts.push(
      new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date),
    );
  return parts.join(" · ");
}
