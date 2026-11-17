import { useEffect, useRef } from "react";
import type { QuestionStep } from "./Questionnaire";
import type { Language } from "../types";

/** Mounted native inputs retain drafts, constraints and asynchronous ownership. */
export function SinglePageFields({
  steps,
  busy,
  language,
  id,
  invalid,
  register,
}: {
  steps: readonly QuestionStep[];
  busy: boolean;
  language: Language;
  id: string;
  invalid: number | null;
  register(index: number, panel: HTMLFieldSetElement | null): void;
}) {
  const options = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (invalid === null) return;
    const panel = document.getElementById(id + "-panel-" + invalid);
    if (panel?.closest("details") && options.current)
      options.current.open = true;
    const field = panel?.querySelector<HTMLElement>(":invalid");
    (field ?? panel)?.focus();
  }, [invalid, id]);
  function fields(kind: "input" | "options" | "preview") {
    return steps.map((step, index) => {
      if ((step.inline ?? "input") !== kind) return null;
      return (
        <fieldset
          key={index}
          ref={(node) => register(index, node)}
          id={id + "-panel-" + index}
          tabIndex={-1}
          disabled={busy}
          className="single-page-field"
          data-input-section={kind}
          aria-labelledby={id + "-" + index}
        >
          <legend id={id + "-" + index} className="sr-only">
            {step.title}
          </legend>
          {step.actions}
          {step.content}
        </fieldset>
      );
    });
  }
  return (
    <div className="single-page-inputs">
      <div className="single-page-main">{fields("input")}</div>
      <aside
        className="single-page-preview"
        aria-label={language === "zh" ? "输入结构" : "Input structure"}
      >
        {fields("preview")}
      </aside>
      <details className="single-page-options" ref={options}>
        <summary>
          {language === "zh" ? "更多设置（可选）" : "More settings (optional)"}
        </summary>
        {fields("options")}
      </details>
    </div>
  );
}
