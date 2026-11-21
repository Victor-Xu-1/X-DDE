import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  useContext,
  type ReactNode,
} from "react";
import type { Job, Language } from "../types";
import "./questionnaire.css";
import { TemplatePreviewContext } from "../examples/context";
import { firstInvalidQuestion } from "./questionnaire-validity";
import { researchError } from "../presentation/research-content";
import { useReveal } from "../presentation/useReveal";
import { availabilityError } from "./task-availability";
import { EnvironmentRecheck } from "./EnvironmentRecheck";
import { TaskPresentationContext } from "./TaskPresentation";
import { SinglePageFields } from "./SinglePageFields";
import { SinglePageReadiness } from "./SinglePageReadiness";
import { GuidedQuestionFields } from "./GuidedQuestionFields";
export interface QuestionStep {
  title: string;
  /** Small utilities reuse these inputs without the research stepper. */
  inline?: "input" | "options" | "preview";
  /** Stable template instruction index; null keeps self-guided optional pages separate. */
  guideStep?: number | null;
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
  renderReview,
  renderResult,
  resultTitle,
  initialResult = null,
  inputKey,
  onMatchingResult,
}: {
  language: Language;
  steps: readonly QuestionStep[];
  busy: boolean;
  error: string;
  ready: boolean | undefined;
  unavailable?: ReactNode;
  onCheckEnvironment?(): void;
  submitLabel: string;
  onSubmit?(): Promise<T | undefined>;
  renderReview?(actions: {
    confirm(send: () => Promise<T | undefined>): Promise<void>;
    dismiss(): void;
  }): ReactNode;
  renderResult(result: T): ReactNode;
  resultTitle?: string;
  initialResult?: T | null;
  /** Exact native request identity for an inline utility's displayed result. */
  inputKey?: string;
  onMatchingResult?(result: T | null): void;
}) {
  const preview = useContext(TemplatePreviewContext);
  const singlePage = useContext(TaskPresentationContext)?.layout === "single";
  const zh = language === "zh",
    id = useId(),
    resultIndex = steps.length,
    lastQuestion = resultIndex - 1;
  const [current, setCurrent] = useState(initialResult ? resultIndex : 0),
    [visited, setVisited] = useState(initialResult ? lastQuestion : 0),
    [job, setJob] = useState<T | null>(initialResult),
    [notice, setNotice] = useState(""),
    [reviewing, setReviewing] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    mounted = useRef(true),
    pending = useRef(false),
    submitTrigger = useRef<HTMLButtonElement>(null),
    panels = useRef<(HTMLFieldSetElement | null)[]>([]);
  const activePanel = useRef<HTMLFieldSetElement | null>(null);
  const stepTrack = useRef<HTMLElement>(null);
  const acceptedInput = useRef(inputKey);
  const matchingResult =
    singlePage && acceptedInput.current === inputKey ? job : null;
  useLayoutEffect(() => {
    onMatchingResult?.(matchingResult);
  }, [matchingResult, onMatchingResult]);
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
  async function submit(reviewedSend?: () => Promise<T | undefined>) {
    if (preview) return;
    if (!singlePage && current !== lastQuestion) {
      if (!reviewedSend) move(current + 1);
      return;
    }
    const openingReview = Boolean(renderReview && !reviewedSend);
    if (
      !complete ||
      (!openingReview && !ready) ||
      (reviewedSend && !reviewing) ||
      busy ||
      pending.current
    )
      return;
    const invalid = firstInvalidQuestion(steps, panels.current, lastQuestion);
    if (invalid >= 0) {
      setReviewing(false);
      setCurrent(invalid);
      setNotice(
        zh
          ? singlePage
            ? "请检查输入内容和设置。"
            : `请检查第${invalid + 1}步的必填内容和参数。`
          : singlePage
            ? "Check the required inputs and settings."
            : `Check step ${invalid + 1}'s required inputs and settings.`,
      );
      return;
    }
    if (openingReview) {
      setReviewing(true);
      return;
    }
    const send = reviewedSend ?? onSubmit;
    if (!send) return;
    setNotice("");
    pending.current = true;
    const submittedInput = inputKey;
    try {
      const created = await send();
      if (created && mounted.current) {
        setReviewing(false);
        acceptedInput.current = submittedInput;
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
    <>
      <form
        className={
          "questionnaire tool-form" + (singlePage ? " single-page-task" : "")
        }
        noValidate={singlePage}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {singlePage ? (
          <SinglePageFields
            steps={steps}
            busy={busy}
            language={language}
            id={id}
            invalid={notice ? current : null}
            register={(index, node) => {
              panels.current[index] = node;
            }}
          />
        ) : (
          <GuidedQuestionFields
            steps={steps}
            titles={titles}
            current={current}
            visited={visited}
            busy={busy}
            completed={Boolean(job)}
            language={language}
            id={id}
            heading={heading}
            track={stepTrack}
            move={move}
            register={(index, node) => {
              panels.current[index] = node;
              if (current === index) activePanel.current = node;
            }}
          />
        )}
        {!singlePage && current === resultIndex && job && renderResult(job)}
        {(notice || error) && (
          <p role="alert" className="error-box">
            {researchError(availabilityError(error || notice, zh), zh)}
          </p>
        )}
        {!singlePage && current === lastQuestion && !ready && !error && (
          <div role="status" className="notice">
            {ready === undefined
              ? zh
                ? "正在确认计算环境…"
                : "Checking the calculation environment…"
              : unavailable}
          </div>
        )}
        {!singlePage && current === lastQuestion && !preview && (
          <EnvironmentRecheck
            ready={ready}
            onRecheck={onCheckEnvironment}
            language={language}
            busy={busy}
          />
        )}
        {(singlePage || current < resultIndex) && (
          <div className="questionnaire-actions">
            {singlePage && (
              <SinglePageReadiness
                ready={ready}
                unavailable={unavailable}
                onRecheck={preview ? undefined : onCheckEnvironment}
                language={language}
                busy={busy}
              />
            )}
            {!singlePage && current > 0 && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => move(current - 1)}
              >
                {zh ? "上一步" : "Back"}
              </button>
            )}
            {!singlePage && current < lastQuestion ? (
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
                ref={submitTrigger}
                type="submit"
                className="primary-button"
                disabled={
                  preview || busy || !complete || (!renderReview && !ready)
                }
              >
                {busy ? (zh ? "正在提交…" : "Submitting…") : submitLabel}
              </button>
            )}
          </div>
        )}
        {reviewing &&
          !preview &&
          renderReview?.({
            confirm: submit,
            dismiss: () => {
              setReviewing(false);
              submitTrigger.current?.focus();
            },
          })}
      </form>
      {!onMatchingResult && matchingResult && renderResult(matchingResult)}
    </>
  );
}

export function Questionnaire(
  props: Omit<
    Parameters<typeof GuidedSteps<Job>>[0],
    "renderResult" | "onMatchingResult"
  >,
) {
  const zh = props.language === "zh";
  const presentation = useContext(TaskPresentationContext);
  return (
    <GuidedSteps<Job>
      {...props}
      onMatchingResult={presentation?.onMatchingResult}
      renderResult={(job) =>
        presentation?.renderResult ? (
          presentation.renderResult(job)
        ) : (
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
        )
      }
    />
  );
}
