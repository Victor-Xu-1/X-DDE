import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { researchModules } from "./research-modules";
import type { HistoryModule } from "./task-history-model";

export function TaskHistoryToolbar({ language, module, projectName, hasProject,
  onRefresh, onStart, onClearProject,
}: {
  language: Language;
  module: HistoryModule;
  projectName: string | undefined;
  hasProject: boolean;
  onRefresh(): void;
  onStart(tool?: ToolId): void;
  onClearProject(): void;
}) {
  const zh = language === "zh";
  const defaultTool = researchModules.find((value) => value.id === module)?.defaultTool;
  return <>
    <header className="task-history-heading">
      <h2>{zh ? "任务结果" : "Task results"}</h2>
      <div className="task-history-heading-actions">
        <button type="button" className="secondary-button" onClick={onRefresh}
          aria-label={zh ? "刷新任务" : "Refresh tasks"}><ReloadOutlined /></button>
        <button type="button" className="primary-button" onClick={() => onStart(defaultTool)}>
          <PlusOutlined aria-hidden="true" /> {zh ? "新建任务" : "New task"}
        </button>
      </div>
    </header>
    {hasProject && <div className="task-project-filter" role="group"
      aria-label={zh ? "项目筛选" : "Project filter"}>
      <span>{zh ? "项目：" : "Project: "}{projectName ?? (zh ? "当前项目" : "Selected project")}</span>
      <button type="button" onClick={onClearProject}>{zh ? "清除筛选" : "Clear filter"}</button>
    </div>}
  </>;
}
