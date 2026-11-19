import type { Language } from "../types";
import {
  researchModuleForView,
  resultModule,
  viewForResults,
  viewForTool,
  type View,
} from "./navigation-model";

/** Tasks stay in their research module; the shared task store remains the authority. */
export function ModuleWorkspaceNavigation({
  view,
  language,
  disabled = false,
  onView,
}: {
  view: View;
  language: Language;
  disabled?: boolean;
  onView(view: View): void;
}) {
  const results = resultModule(view);
  const module = researchModuleForView(view);
  if (!module) return null;
  const zh = language === "zh";
  return (
    <nav
      className="module-workspace-navigation segmented"
      aria-label={zh ? "模块工作区" : "Module workspace"}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!results}
        className={!results ? "selected" : ""}
        onClick={() => onView(viewForTool(module.defaultTool))}
      >
        {zh ? "新建任务" : "New task"}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={Boolean(results)}
        className={results ? "selected" : ""}
        onClick={() => onView(viewForResults(module.id))}
      >
        {zh ? "任务结果" : "Task results"}
      </button>
    </nav>
  );
}
