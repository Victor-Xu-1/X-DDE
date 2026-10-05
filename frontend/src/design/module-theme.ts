import type { TaskRequest } from "../operations/types";
import { tools, type ToolId } from "../operations/catalog";
import { moduleForTool, type ModuleId } from "../studio/research-modules";
import type { View } from "../studio/navigation-model";

export type ModuleTheme =
  | "targets"
  | "structures"
  | "docking"
  | "molecules"
  | "biologics"
  | "properties"
  | "research"
  | "environments";
const moduleThemes: Record<ModuleId, ModuleTheme> = {
  targets: "targets",
  structures: "structures",
  binding: "docking",
  molecules: "molecules",
  biologics: "biologics",
  evaluation: "properties",
};
export const themeForModule = (id: ModuleId): ModuleTheme => moduleThemes[id];
export function themeForTool(id: ToolId | null | undefined): ModuleTheme {
  const module = moduleForTool(id);
  return module ? themeForModule(module.id) : "environments";
}
export function workspaceTheme(
  view: View,
  tool: ToolId | null,
  task?: TaskRequest | null,
): ModuleTheme {
  if (tool) return themeForTool(tool);
  if (["deployment", "settings", "help"].includes(view)) return "environments";
  if (view === "tasks" && task) {
    if (task.operation === "harness")
      return themeForTool(tools.find((t) => t.id === task.tool)?.id);
    const operations: Record<string, ModuleTheme> = {
      predict: "structures",
      inspect: "structures",
      json: "structures",
      msa: "structures",
      mt: "structures",
      prep: "structures",
      structure_prepare: "structures",
      receptor_ensemble: "structures",
      target_research: "targets",
      reference_import: "targets",
      molecular_states: "molecules",
      molecule_minimize: "molecules",
      diffsbdd: "molecules",
      docking: "docking",
      pocket_search: "docking",
      pose_quality: "docking",
      antibody_number: "biologics",
      antibody_humanize: "biologics",
      admet_predict: "properties",
      properties: "properties",
      library_screen: "properties",
    };
    return operations[task.operation ?? "predict"] ?? "research";
  }
  return "research";
}
