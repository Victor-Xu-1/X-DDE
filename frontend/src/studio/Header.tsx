import type { Job, Language } from "../types";
import { viewTitle, type View } from "./navigation-model";
import { TaskSearch } from "./TaskSearch";
import { TaskNotifications } from "./TaskNotifications";
import "./header.css";
export function Header({
  view,
  language,
  jobs,
  onJob,
  storageWarning,
}: {
  view: View;
  language: Language;
  jobs: Job[];
  onJob(id: string): void;
  storageWarning: boolean;
}) {
  const zh = language === "zh";
  return (
    <header className="studio-topbar">
      <div className="page-context">
        <span className="page-context-signature" aria-hidden="true">
          AI · BIOPHARMA
        </span>
        <span className="page-context-title" title={viewTitle(view, language)}>
          {viewTitle(view, language)}
        </span>
      </div>
      <TaskSearch jobs={jobs} language={language} onJob={onJob} />
      <div className="top-actions">
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
