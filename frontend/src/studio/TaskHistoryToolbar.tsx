import {
  ArrowLeftOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { RefObject } from "react";
import { useInputActionScope } from "../guided/InputActionScope";
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
  headingRef,
  count,
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
  headingRef: RefObject<HTMLHeadingElement | null>;
  count: number | undefined;
  onHistory(): void;
  onRefresh(): void;
  onStart(tool?: ToolId): void;
  onClearProject(): void;
}) {
  const zh = language === "zh";
  const backLabel = zh ? "返回任务结果" : "Back to task results";
  const refreshLabel = zh ? "刷新任务" : "Refresh tasks";
  const submitting = useInputActionScope()?.action === "submission";
  const researchModule = researchModules.find((value) => value.id === module);
  return (
    <>
      {view === "history" && (
        <header className="task-history-heading">
          <div className="task-history-title">
            <h2 ref={headingRef} tabIndex={-1}>
              {zh ? "任务结果" : "Task results"}
            </h2>
            {Boolean(count) && (
              <span className="task-history-count">
                {zh
                  ? `${count} 项任务`
                  : count === 1
                    ? "1 task"
                    : `${count} tasks`}
              </span>
            )}
          </div>
          <div className="task-history-heading-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onRefresh}
              aria-label={refreshLabel}
            >
              <ReloadOutlined />
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => onStart(researchModule?.defaultTool)}
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
            disabled={submitting}
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeftOutlined aria-hidden="true" />
            <span className="task-result-back-label">{backLabel}</span>
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
            aria-label={refreshLabel}
            title={refreshLabel}
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
          <button type="button" onClick={onClearProject} disabled={submitting}>
            {zh ? "清除筛选" : "Clear filter"}
          </button>
        </div>
      )}
    </>
  );
}
