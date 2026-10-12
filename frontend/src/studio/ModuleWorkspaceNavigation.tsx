import type { Language } from "../types";
import { moduleForTool, researchModules } from "./research-modules";
import {
  resultModule, toolForView, viewForResults, viewForTool, type View,
} from "./navigation-model";

/** Tasks stay in their research module; the shared task store remains the authority. */
export function ModuleWorkspaceNavigation({ view, language, onView }: {
  view: View;
  language: Language;
  onView(view: View): void;
}) {
  const results = resultModule(view);
  const module = researchModules.find((item) => item.id === results)
    ?? moduleForTool(toolForView(view));
  if (!module) return null;
  const zh = language === "zh";
  return (
    <nav className="module-workspace-navigation segmented" aria-label={zh ? "模块工作区" : "Module workspace"}>
      <button type="button" aria-pressed={!results} className={!results ? "selected" : ""}
        onClick={() => onView(viewForTool(module.defaultTool))}>
        {zh ? "新建任务" : "New task"}
      </button>
      <button type="button" aria-pressed={Boolean(results)} className={results ? "selected" : ""}
        onClick={() => onView(viewForResults(module.id))}>
        {zh ? "任务结果" : "Task results"}
      </button>
    </nav>
  );
}
