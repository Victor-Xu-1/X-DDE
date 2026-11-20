import type { Job, Language } from "../types";
import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import {
  researchModuleForView,
  toolForView,
  viewTitle,
  type View,
} from "./navigation-model";
import { TaskSearch } from "./TaskSearch";
import { TaskNotifications } from "./TaskNotifications";
import { BackendControls } from "../utilities/BackendControls";
import { molecularUtilityCapabilities } from "../utilities/UtilityTask";
import "./header.css";

// Keep this breakpoint aligned with the two-row layout in header.css.
const handset = "(max-width: 600px)";
function subscribeToHeaderLayout(onChange: () => void) {
  const media = window.matchMedia?.(handset);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const compactHeader = () => window.matchMedia?.(handset).matches ?? false;

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
  onOpenRecognition,
  resultOperation,
}: {
  view: View;
  language: Language;
  jobs: Job[];
  onJob(id: string): void;
  storageWarning: boolean;
  workspace?: ReactNode;
  onOpenRecognition?(): void;
  resultOperation?: string;
}) {
  const zh = language === "zh";
  const researchModule = researchModuleForView(view);
  const module = view === "utilities" ? utilities : researchModule;
  const compact = useSyncExternalStore(subscribeToHeaderLayout, compactHeader);
  const moduleNavigation = <Fragment key="workspace">{workspace}</Fragment>;
  const search = (
    <TaskSearch key="search" jobs={jobs} language={language} onJob={onJob} />
  );
  const actions = (
    <div key="actions" className="top-actions">
      <BackendControls
        key={researchModule?.id ?? (module ? "utilities" : "all")}
        language={language}
        module={module}
        currentCapability={toolForView(view) ?? undefined}
        resultOperation={resultOperation}
        inlineSingle={!compact && !resultOperation}
        moduleHasRecognition={view === "utilities"}
        onOpenRecognition={onOpenRecognition}
      />
      <TaskNotifications jobs={jobs} language={language} onJob={onJob} />
    </div>
  );
  return (
    <header
      className="studio-topbar"
      data-task-result={resultOperation || undefined}
    >
      <div className="page-context">
        <span className="page-context-title" title={viewTitle(view, language)}>
          {viewTitle(view, language)}
        </span>
      </div>
      {compact
        ? [search, actions, moduleNavigation]
        : [moduleNavigation, search, actions]}
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
