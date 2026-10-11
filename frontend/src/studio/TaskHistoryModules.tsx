import { ProfileOutlined, RightOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import { researchIcons } from "./research-icons";
import { researchModules } from "./research-modules";
import {
  historyModuleLabel,
  moduleCounts,
  type HistoryModule,
  type TaskHistoryPage,
} from "./task-history-model";

export function TaskHistoryModules({
  language,
  counts,
  loading,
  onSelect,
}: {
  language: Language;
  counts: TaskHistoryPage["counts"];
  loading: boolean;
  onSelect(module: HistoryModule): void;
}) {
  const zh = language === "zh";
  const modules: HistoryModule[] = researchModules.map((module) => module.id);
  if (moduleCounts(counts, "other").total) modules.push("other");
  return (
    <div
      className="task-history-modules"
      role="group"
      aria-label={zh ? "任务模块" : "Task modules"}
    >
      {modules.map((module) => {
        const count = moduleCounts(counts, module);
        const Icon =
          module === "other" ? ProfileOutlined : researchIcons[module];
        return (
          <button
            type="button"
            key={module}
            data-task-module={module}
            onClick={() => onSelect(module)}
            className={count.active ? "has-active" : ""}
          >
            <span className="task-history-module-icon" aria-hidden="true">
              <Icon />
            </span>
            <strong>{historyModuleLabel(module, language)}</strong>
            <span className="task-history-module-count">
              {loading && !count.total ? "—" : count.total}{" "}
              {zh ? "个任务" : "tasks"}
            </span>
            {count.active > 0 && (
              <small>
                {count.active} {zh ? "进行中" : "active"}
              </small>
            )}
            <RightOutlined
              className="task-history-module-arrow"
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
