import { tools, type ToolId } from "../operations/catalog";
import type { Job, Language, Status } from "../types";
import {
  moduleForTool,
  researchModules,
  type ModuleId,
} from "./research-modules";
import { taskKindRules } from "./task-kind-rules";

export type HistoryModule = ModuleId | "other";
export const historyStatuses: readonly Status[] = [
  "queued",
  "running",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
];
export interface TaskHistoryItem {
  job: Job;
  capability_id: string;
  example_cases?: { id: string; label: [string, string] }[];
  origin?: TaskHistoryIdentity["origin"];
}
export interface TaskHistoryIdentity {
  job_id: string;
  capability_id: string;
  origin: "research" | "fixed_example" | "setup_validation";
  example_cases: { id: string; label: [string, string] }[];
}
export interface TaskHistoryPage {
  items: TaskHistoryItem[];
  counts: Record<string, { total: number; active: number }>;
  total: number;
  offset: number;
  limit: number;
}
export interface HistoryFilter {
  scope?: "research" | "examples";
  module: HistoryModule | null;
  type: string;
  status: Status | "all";
  query: string;
  page: number;
  project: string | null;
}
const internalModules: Record<string, ModuleId> = {
  "native.inspect": "structures",
  "diffsbdd.identity": "molecules",
  "diffsbdd.edit": "molecules",
  "pose.cluster": "binding",
  "pose.minimize": "molecules",
};
export function moduleForKind(kind: string): HistoryModule {
  return moduleForTool(kind as ToolId)?.id ?? internalModules[kind] ?? "other";
}
export function kindForJob(job: Job): string {
  const operation = job.request.operation ?? "predict";
  const rule = taskKindRules.find((rule) => {
    if (rule.operation !== operation) return false;
    let value: unknown = job.request;
    if (rule.field) {
      for (const key of rule.field.split(".")) {
        value =
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined;
      }
      return value === rule.value;
    }
    return true;
  });
  return rule?.id ?? "other";
}
export function kindsForModule(module: HistoryModule) {
  return [
    ...new Set([...taskKindRules.map((rule) => rule.id), "other"]),
  ].filter((kind) => moduleForKind(kind) === module);
}
export function historyModuleLabel(module: HistoryModule, language: Language) {
  return (
    researchModules.find((value) => value.id === module)?.label[
      language === "zh" ? 0 : 1
    ] ?? (language === "zh" ? "其他任务" : "Additional tasks")
  );
}
const hiddenLabels: Record<string, readonly [string, string]> = {
  "native.inspect": ["原子身份检查", "Atom identity inspection"],
  "diffsbdd.identity": ["分子身份检查", "Molecule identity inspection"],
  "diffsbdd.edit": ["分子编辑校验", "Molecule edit validation"],
  "pose.cluster": ["结合姿势聚类", "Binding-pose clustering"],
  "pose.minimize": ["分子能量最小化", "Molecule energy minimization"],
  other: ["其他任务", "Additional tasks"],
};
export function historyKindLabel(kind: string, language: Language) {
  return (tools.find((tool) => tool.id === kind)?.label ??
    hiddenLabels[kind] ??
    hiddenLabels.other)[language === "zh" ? 0 : 1];
}
export function moduleCounts(
  counts: TaskHistoryPage["counts"],
  module: HistoryModule,
) {
  return Object.entries(counts).reduce(
    (result, [kind, count]) => {
      if (moduleForKind(kind) === module) {
        result.total += count.total;
        result.active += count.active;
      }
      return result;
    },
    { total: 0, active: 0 },
  );
}
export const historyPageSize = 20;
export function historyUrl(filter: HistoryFilter) {
  const params = new URLSearchParams({
    limit: String(historyPageSize),
    offset: String(filter.page * historyPageSize),
  });
  if (filter.project) params.set("project_id", filter.project);
  if (filter.scope === "examples") params.set("scope", "examples");
  if (filter.status !== "all") params.set("status", filter.status);
  if (filter.query.trim()) params.set("q", filter.query.trim());
  if (filter.type !== "all") params.append("capability", filter.type);
  else if (filter.module)
    for (const kind of kindsForModule(filter.module))
      params.append("capability", kind);
  return "/task-history?" + params;
}
