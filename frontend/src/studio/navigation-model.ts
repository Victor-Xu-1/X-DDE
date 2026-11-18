import { tools, type ToolId } from "../operations/catalog";
import {
  moduleForTool,
  researchModules,
  type ModuleId,
} from "./research-modules";
import type { Language } from "../types";
export type View =
  | "utilities"
  | Exclude<ToolId, "predict" | "resources">
  | "home"
  | "tools"
  | "research"
  | "tasks"
  | `results:${ModuleId | "other"}`
  | "deployment"
  | "settings"
  | "help";
export const toolForView = (view: View): ToolId | null =>
  view === "home"
    ? "predict"
    : (tools.find((tool) => tool.id === view)?.id ?? null);
export const viewForTool = (tool: ToolId): View =>
  tool === "predict" ? "home" : tool === "resources" ? "deployment" : tool;
export function resultModule(view: View): ModuleId | "other" | null {
  return view.startsWith("results:")
    ? (view.slice(8) as ModuleId | "other")
    : null;
}
export const viewForResults = (module: ModuleId | "other"): View =>
  `results:${module}`;
export function researchModuleForView(view: View) {
  const results = resultModule(view);
  return results
    ? researchModules.find((module) => module.id === results)
    : moduleForTool(toolForView(view));
}
export const navigationItems = [
  {
    id: "utilities" as const,
    module: null,
    label: ["小工具", "Utilities"] as const,
    short: ["工具", "Tools"] as const,
    help: [
      "图片转 SMILES、分子结构编辑与导出",
      "Image to SMILES, structure editing and export",
    ] as const,
  },
  ...researchModules.map((module) => ({
    id: viewForTool(module.defaultTool),
    module: module.id,
    label: module.label,
    short: module.short,
    help: module.purpose,
  })),
  {
    id: "research" as const,
    module: null,
    label: ["研究空间", "Research workspace"] as const,
    short: ["文件", "Files"] as const,
    help: [
      "项目、研究文件、关系与结构编辑",
      "Projects, research files, relationships and structure editing",
    ] as const,
  },
  {
    id: "tools" as const,
    module: null,
    label: ["全部能力", "All capabilities"] as const,
    short: ["工具", "Tools"] as const,
    help: [
      "按研究流程与药物形式查找完整工具",
      "Browse every tool by research workflow and drug modality",
    ] as const,
  },
];
export const managementItems = [
  { id: "deployment", label: ["安装与运行", "Installation and runtime"] },
  { id: "settings", label: ["界面设置", "Appearance and language"] },
  { id: "help", label: ["使用帮助", "Getting started"] },
] as const;
export function navigationActive(
  view: View,
  item: (typeof navigationItems)[number],
) {
  return item.module
    ? researchModuleForView(view)?.id === item.module
    : view === item.id;
}
export function viewTitle(view: View, language: Language) {
  const module = researchModuleForView(view);
  const item =
    navigationItems.find((item) => item.id === view) ??
    managementItems.find((item) => item.id === view);
  return (module?.label ?? item?.label)?.[language === "zh" ? 0 : 1] ?? "X-DDE";
}
