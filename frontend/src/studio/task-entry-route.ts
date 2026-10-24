import { tools, type ToolId } from "../operations/catalog";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function projectId(value: string | null) {
  return value && uuid.test(value) ? value.toLowerCase() : null;
}
export interface TaskEntryRoute {
  tool: Exclude<ToolId, "resources"> | null;
  project: string | null;
}
/** Restore an empty questionnaire, never historical inputs or a selected result. */
export function taskEntryRoute(hash: string): TaskEntryRoute | null {
  const params = new URLSearchParams(hash.slice(1));
  if (params.size === 1 && params.get("task") === "")
    return { tool: null, project: null }; // Existing empty-task bookmarks.
  if (params.get("view") !== "new") return null;
  const tool = tools.find((item) => item.id === params.get("tool"));
  return {
    tool: tool && tool.id !== "resources" ? tool.id : null,
    project: projectId(params.get("project")),
  };
}
export function taskEntryHash(
  tool: ToolId | null,
  project: string | null = null,
) {
  const params = new URLSearchParams({ view: "new" });
  if (tool && tool !== "resources") params.set("tool", tool);
  const id = projectId(project);
  if (id) params.set("project", id);
  return "#" + params;
}
