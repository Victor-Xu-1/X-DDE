import type { Language } from "../types";
import type { GraphNode } from "./types";

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
  if (task) parts.push(task.label);
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
