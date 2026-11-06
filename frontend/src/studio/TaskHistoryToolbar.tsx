import {
  ArrowLeftOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { researchModules } from "./research-modules";
import type { HistoryModule } from "./task-history-model";

export function TaskHistoryToolbar({
  language,
  module,
  projectName,
  hasProject,
  view,
  onHistory,
  onRefresh,
  onStart,
  onClearProject,
}: {
  language: Language;
  module: HistoryModule;
  projectName: string | undefined;
  hasProject: boolean;
  view: "history" | "prediction" | "detail";
  onHistory(): void;
  onRefresh(): void;
  onStart(tool?: ToolId): void;
  onClearProject(): void;
}) {
  const zh = language === "zh";
  const defaultTool = researchModules.find(
    (value) => value.id === module,
  )?.defaultTool;
  return (
    <>
      {view === "history" && (
        <header className="task-history-heading">
          <h2>{zh ? "任务结果" : "Task results"}</h2>
          <div className="task-history-heading-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onRefresh}
              aria-label={zh ? "刷新任务" : "Refresh tasks"}
            >
              <ReloadOutlined />
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onStart(defaultTool)}
            >
              <PlusOutlined aria-hidden="true" /> {zh ? "新建任务" : "New task"}
            </button>
          </div>
        </header>
      )}
      {view === "detail" && (
        <nav
          className="task-result-history"
          aria-label={zh ? "任务结果导航" : "Task result navigation"}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={onHistory}
          >
            <ArrowLeftOutlined aria-hidden="true" />
            {zh ? "返回任务结果" : "Back to task results"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
            aria-label={zh ? "刷新任务" : "Refresh tasks"}
          >
            <ReloadOutlined aria-hidden="true" />
          </button>
        </nav>
      )}
      {hasProject && (
        <div
          className={
            "task-project-filter" +
            (view !== "history" ? " is-result-context" : "")
          }
          role="group"
          aria-label={zh ? "项目筛选" : "Project filter"}
        >
          <span>
            {zh ? "项目：" : "Project: "}
            {projectName ?? (zh ? "当前项目" : "Selected project")}
          </span>
          <button type="button" onClick={onClearProject}>
            {zh ? "清除筛选" : "Clear filter"}
          </button>
        </div>
      )}
    </>
  );
}
