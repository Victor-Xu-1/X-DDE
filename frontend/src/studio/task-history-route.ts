import {
  kindsForModule,
  historyStatuses,
  type HistoryFilter,
  type HistoryModule,
} from "./task-history-model";
import { researchModules } from "./research-modules";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** The URL owns the browsing location; unknown filters never become API inputs. */
export function taskHistoryRoute(hash: string): HistoryFilter | null {
  const params = new URLSearchParams(hash.slice(1));
  if (params.get("view") !== "tasks") return null;
  const name = params.get("module");
  const module: HistoryModule | null =
    name === "other" || researchModules.some((item) => item.id === name)
      ? (name as HistoryModule)
      : null;
  const kind = params.get("type") ?? "all";
  const status = params.get("status") ?? "all";
  const page = Number(params.get("page") ?? 0);
  const project = params.get("project") ?? "";
  return {
    module,
    type: module && kindsForModule(module).includes(kind) ? kind : "all",
    status: historyStatuses.includes(
      status as HistoryFilter["status"] & (typeof historyStatuses)[number],
    )
      ? (status as HistoryFilter["status"])
      : "all",
    query: (params.get("q") ?? "").slice(0, 180),
    page: Number.isInteger(page) && page >= 0 && page <= 50000 ? page : 0,
    project: uuid.test(project) ? project.toLowerCase() : null,
  };
}

export function taskHistoryHash(filter: HistoryFilter, task = "") {
  const params = new URLSearchParams({ view: "tasks" });
  if (filter.module) params.set("module", filter.module);
  if (filter.type !== "all") params.set("type", filter.type);
  if (filter.status !== "all") params.set("status", filter.status);
  if (filter.query.trim()) params.set("q", filter.query.trim());
  if (filter.page) params.set("page", String(filter.page));
  if (filter.project) params.set("project", filter.project);
  if (uuid.test(task)) params.set("task", task);
  return "#" + params;
}
