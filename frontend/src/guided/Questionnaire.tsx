import {
  useEffect,
  useId,
  useRef,
  useState,
  useContext,
  type ReactNode,
} from "react";
import type { Job, Language } from "../types";
import "./questionnaire.css";
import { TemplatePreviewContext } from "../examples/context";
import { TemplateStepHelp } from "../examples/TemplateStepHelp";
import { firstInvalidQuestion } from "./questionnaire-validity";
import { researchError } from "../presentation/research-content";
import { useReveal } from "../presentation/useReveal";
import { ActiveIndicator } from "../presentation/ActiveIndicator";
import { availabilityError } from "./task-availability";
import { EnvironmentRecheck } from "./EnvironmentRecheck";
export interface QuestionStep {
  title: string;
  guideStep?: number;
  actions?: ReactNode;
  content: ReactNode;
  valid: boolean;
}
export function GuidedSteps<T extends { id: string }>({
  language,
  steps,
  busy,
  error,
  ready,
  unavailable,
  onCheckEnvironment,
  submitLabel,
  onSubmit,
  renderResult,
  resultTitle,
  initialResult = null,
}: {
  language: Language;
  steps: readonly QuestionStep[];
  busy: boolean;
  error: string;
  ready: boolean | undefined;
  unavailable?: ReactNode;
  onCheckEnvironment?(): void;
  submitLabel: string;
  onSubmit(): Promise<T | undefined>;
  renderResult(result: T): ReactNode;
  resultTitle?: string;
  initialResult?: T | null;
}) {
  const preview = useContext(TemplatePreviewContext);
  const zh = language === "zh",
    id = useId(),
    resultIndex = steps.length,
    lastQuestion = resultIndex - 1;
  const [current, setCurrent] = useState(initialResult ? resultIndex : 0),
    [visited, setVisited] = useState(initialResult ? lastQuestion : 0),
    [job, setJob] = useState<T | null>(initialResult),
    [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    mounted = useRef(true),
    pending = useRef(false),
    panels = useRef<(HTMLFieldSetElement | null)[]>([]);
  const activePanel = useRef<HTMLFieldSetElement | null>(null);
  const stepTrack = useRef<HTMLElement>(null);
  useReveal(activePanel, current);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [current]);
  const complete = steps.every((s) => s.valid);
  function move(target: number) {
    if (busy || job || target < 0 || target > lastQuestion) return;
    if (target > current) {
      const invalid = firstInvalidQuestion(steps, panels.current, target - 1);
      if (invalid >= 0) {
        setCurrent(invalid);
        setNotice(
          zh
            ? `请检查第${invalid + 1}步的必填内容和参数。`
            : `Check step ${invalid + 1}'s required inputs and settings.`,
        );
        return;
      }
    }
    setNotice("");
    setCurrent(target);
    setVisited((v) => Math.max(v, target));
  }
  async function submit() {
    if (preview) return;
    if (current !== lastQuestion) {
      move(current + 1);
      return;
    }
    if (!complete || !ready || busy || pending.current) return;
    const invalid = firstInvalidQuestion(steps, panels.current, lastQuestion);
    if (invalid >= 0) {
      setCurrent(invalid);
      setNotice(
        zh
          ? `请检查第${invalid + 1}步的必填内容和参数。`
          : `Check step ${invalid + 1}'s required inputs and settings.`,
      );
      return;
    }
    pending.current = true;
    try {
      const created = await onSubmit();
      if (created && mounted.current) {
        setJob(created);
        setCurrent(resultIndex);
      }
    } catch (e) {
      if (mounted.current)
        setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
    }
  }
  const titles = [
    ...steps.map((s) => s.title),
    resultTitle ?? (zh ? "查看结果" : "View results"),
  ];
  return (
    <form
      className="questionnaire tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <nav
        ref={stepTrack}
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
              (job
                ? index !== resultIndex
                : index === resultIndex || index > visited)
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
          container={stepTrack}
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
        {current < resultIndex && steps[current].actions && (
          <fieldset className="questionnaire-heading-tools" disabled={busy}>
            {steps[current].actions}
          </fieldset>
        )}
      </header>
      {current < resultIndex && (
        <TemplateStepHelp
          step={steps[current].guideStep ?? current}
          language={language}
        />
      )}
      {steps.map((step, index) => (
        <fieldset
          ref={(node) => {
            panels.current[index] = node;
            if (current === index) activePanel.current = node;
          }}
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
      {current === resultIndex && job && renderResult(job)}
      {(notice || error) && (
        <p role="alert" className="error-box">
          {researchError(availabilityError(error || notice, zh), zh)}
        </p>
      )}
      {current === lastQuestion && !ready && !error && (
        <div role="status" className="notice">
          {ready === undefined
            ? zh
              ? "正在确认计算环境…"
              : "Checking the calculation environment…"
            : unavailable}
        </div>
      )}
      {current === lastQuestion && !preview && (
        <EnvironmentRecheck
          ready={ready}
          onRecheck={onCheckEnvironment}
          language={language}
          busy={busy}
        />
      )}
      {current < resultIndex && (
        <div className="questionnaire-actions">
          {current > 0 && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => move(current - 1)}
            >
              {zh ? "上一步" : "Back"}
            </button>
          )}
          {current < lastQuestion ? (
            <button
              key="next-question"
              type="button"
              className="primary-button"
              disabled={busy || !steps[current].valid}
              onClick={() => move(current + 1)}
            >
              {zh ? "下一步" : "Next"}
            </button>
          ) : (
            <button
              key="submit-task"
              type="submit"
              className="primary-button"
              disabled={preview || busy || !complete || !ready}
            >
              {busy ? (zh ? "正在提交…" : "Submitting…") : submitLabel}
            </button>
          )}
        </div>
      )}
    </form>
  );
}

export function Questionnaire(
  props: Omit<Parameters<typeof GuidedSteps<Job>>[0], "renderResult">,
) {
  const zh = props.language === "zh";
  return (
    <GuidedSteps<Job>
      {...props}
      renderResult={(job) => (
        <section aria-label={zh ? "已提交的任务" : "Submitted task"}>
          <p role="status">
            {zh
              ? "任务已提交，结果以实际计算为准。"
              : "Task submitted. Results depend on the actual calculation."}
          </p>
          <a
            className="primary-button"
            href={"/#task=" + encodeURIComponent(job.id)}
          >
            {zh ? "查看任务进度与结果" : "Open task progress and results"}
          </a>
        </section>
      )}
    />
  );
}
