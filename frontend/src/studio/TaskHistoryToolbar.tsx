import { LeftOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { researchModules } from "./research-modules";
import {
  historyModuleLabel,
  moduleCounts,
  type HistoryModule,
  type TaskHistoryPage,
} from "./task-history-model";

export function TaskHistoryToolbar({
  language,
  module,
  counts,
  projectName,
  hasProject,
  onSelect,
  onRefresh,
  onStart,
  onClearProject,
}: {
  language: Language;
  module: HistoryModule | null;
  counts: TaskHistoryPage["counts"];
  projectName: string | undefined;
  hasProject: boolean;
  onSelect(module: HistoryModule | null): void;
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
      <header className="task-history-heading">
        <div>
          {module && (
            <button
              type="button"
              className="task-history-back"
              onClick={() => onSelect(null)}
            >
              <LeftOutlined /> {zh ? "任务模块" : "Task modules"}
            </button>
          )}
          <h2>
            {module
              ? historyModuleLabel(module, language)
              : zh
                ? "任务模块"
                : "Task modules"}
          </h2>
        </div>
        <div className="task-history-heading-actions">
          {module && (
            <label className="task-history-switch">
              <span className="sr-only">
                {zh ? "切换任务模块" : "Switch task module"}
              </span>
              <select
                value={module}
                onChange={(event) =>
                  onSelect(event.target.value as HistoryModule)
                }
              >
                {researchModules.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label[zh ? 0 : 1]}
                  </option>
                ))}
                {(module === "other" ||
                  moduleCounts(counts, "other").total > 0) && (
                  <option value="other">
                    {historyModuleLabel("other", language)}
                  </option>
                )}
              </select>
            </label>
          )}
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
            <PlusOutlined /> {zh ? "新建任务" : "New task"}
          </button>
        </div>
      </header>
      {hasProject && (
        <div
          className="task-project-filter"
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
