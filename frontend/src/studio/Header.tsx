import type { Job, Language } from "../types";
import {
  researchModuleForView,
  viewTitle,
  type View,
} from "./navigation-model";
import { TaskSearch } from "./TaskSearch";
import { TaskNotifications } from "./TaskNotifications";
import { BackendControls } from "../utilities/BackendControls";
import { molecularUtilityCapabilities } from "../utilities/UtilityTask";
import "./header.css";
import type { ReactNode } from "react";

const utilities = {
  label: ["小工具", "Utilities"] as const,
  tools: molecularUtilityCapabilities,
};

export function Header({
  view,
  language,
  jobs,
  onJob,
  storageWarning,
  workspace,
  runtime,
}: {
  view: View;
  language: Language;
  jobs: Job[];
  onJob(id: string): void;
  storageWarning: boolean;
  workspace?: ReactNode;
  runtime?: ReactNode;
}) {
  const zh = language === "zh";
  const researchModule = researchModuleForView(view);
  const module = view === "utilities" ? utilities : researchModule;
  return (
    <header className="studio-topbar">
      <div className="page-context">
        <span className="page-context-title" title={viewTitle(view, language)}>
          {viewTitle(view, language)}
        </span>
      </div>
      {workspace}
      <TaskSearch jobs={jobs} language={language} onJob={onJob} />
      <div className="top-actions">
        {module ? (
          <BackendControls
            key={researchModule?.id ?? "utilities"}
            language={language}
            module={module}
          />
        ) : (
          runtime
        )}
        <TaskNotifications jobs={jobs} language={language} onJob={onJob} />
      </div>
      {storageWarning && (
        <div role="status" className="header-warning">
          {zh
            ? "浏览器无法记住语言选择。"
            : "Language preference could not be saved."}
        </div>
      )}
    </header>
  );
}
