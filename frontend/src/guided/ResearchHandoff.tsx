import { FollowupBackendControl } from "../utilities/TaskBackendControl";
import type { ReactNode } from "react";
import type { ToolId } from "../operations/catalog";
import type { Language } from "../types";
import { ExampleContext, TemplatePreviewContext } from "../examples/context";
/** A chosen output starts a fresh questionnaire; the archived example remains immutable. */
export function ResearchHandoff({
  language,
  onBack,
  capability,
  children,
}: {
  language: Language;
  onBack(): void;
  capability: ToolId | null;
  children: ReactNode;
}) {
  return (
    <section className="task-workspace is-input">
      <button className="tool-back-button" type="button" onClick={onBack}>
        {language === "zh" ? "← 返回结果" : "← Back to results"}
      </button>
      {capability && (
        <FollowupBackendControl language={language} capability={capability} />
      )}
      <ExampleContext.Provider value={null}>
        <TemplatePreviewContext.Provider value={false}>
          {children}
        </TemplatePreviewContext.Provider>
      </ExampleContext.Provider>
    </section>
  );
}
