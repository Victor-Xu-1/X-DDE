import type { RefObject } from "react";
import type { Language } from "../types";
import type { QuestionStep } from "./Questionnaire";
import { ActiveIndicator } from "../presentation/ActiveIndicator";
import { TemplateStepHelp } from "../examples/TemplateStepHelp";

export function GuidedQuestionFields({
  language,
  steps,
  titles,
  current,
  visited,
  busy,
  completed,
  id,
  heading,
  track,
  move,
  register,
}: {
  language: Language;
  steps: readonly QuestionStep[];
  titles: string[];
  current: number;
  visited: number;
  busy: boolean;
  completed: boolean;
  id: string;
  heading: RefObject<HTMLHeadingElement | null>;
  track: RefObject<HTMLElement | null>;
  move(target: number): void;
  register(index: number, node: HTMLFieldSetElement | null): void;
}) {
  const result = steps.length,
    zh = language === "zh";
  return (
    <>
      <nav
        ref={track}
        className="questionnaire-steps"
        aria-label={zh ? "任务步骤" : "Task steps"}
      >
        {titles.map((title, index) => (
          <button
            type="button"
            key={index}
            aria-current={current === index ? "step" : undefined}
            disabled={
              busy ||
              (completed
                ? index !== result
                : index === result || index > visited)
            }
            title={title}
            aria-label={(zh ? "步骤 " : "Step ") + (index + 1) + ": " + title}
            onClick={() => move(index)}
          >
            <span aria-hidden="true">{index < current ? "✓" : index + 1}</span>
            <span>{title}</span>
          </button>
        ))}
        <ActiveIndicator
          container={track}
          selection={current + ":" + titles.join("|")}
        />
      </nav>
      <header className="questionnaire-page-heading">
        <h2
          ref={heading}
          tabIndex={-1}
          className="questionnaire-heading"
          aria-label={current + 1 + ". " + titles[current]}
        >
          {titles[current]}
        </h2>
        {current < result && steps[current].actions && (
          <fieldset className="questionnaire-heading-tools" disabled={busy}>
            {steps[current].actions}
          </fieldset>
        )}
      </header>
      {current < result && steps[current].guideStep !== null && (
        <TemplateStepHelp
          step={steps[current].guideStep ?? current}
          language={language}
        />
      )}
      {steps.map((step, index) => (
        <fieldset
          ref={(node) => register(index, node)}
          key={index}
          hidden={current !== index}
          disabled={busy || current !== index}
          aria-labelledby={id + "-" + index}
        >
          <legend id={id + "-" + index} className="sr-only">
            {step.title}
          </legend>
          {step.content}
        </fieldset>
      ))}
    </>
  );
}
