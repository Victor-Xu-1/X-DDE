import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Job } from "../types";
import { workflowOperations } from "../workflows/model";
import {
  useExampleTemplate,
  type ExampleTemplateOptions,
} from "./useExampleTemplate";
import { ExampleResultSet } from "./ExampleResultSet";
import { ExampleRecordResult } from "./ExampleRecordResult";
import { ExampleToolbar } from "./ExampleToolbar";
import { ExampleFeedback } from "./ExampleFeedback";
import { TemplatePreviewContext } from "./context";
import { reviewedHighlight } from "./review-highlights";
import {
  hasReviewedReferenceContacts,
  ReviewedReferenceContacts,
} from "./review-highlights-contacts";
import "./examples.css";
import {
  hasReviewedReceptorComparison,
  ReviewedReceptorComparison,
  reviewedReceptorFinding,
} from "./ReviewedReceptorComparison";

export function ExampleActions(
  options: ExampleTemplateOptions & {
    active?: boolean;
    onBack?(): void;
    onBusyChange?(pending: boolean): void;
  },
) {
  const { capability, language, onBack } = options;
  const state = useExampleTemplate(options);
  const result = state.result;
  const recordExample = result?.example;
  const [stage, setStage] = useState<{
    result: typeof result;
    job: Job | null | undefined;
  }>();
  const reportStage = useCallback(
    (job: Job | null | undefined) => setStage({ result, job }),
    [result],
  );
  const selectedJob =
    stage && stage.result === result ? stage.job : (result?.job ?? undefined);
  const workflow = recordExample?.record;
  const workflowPlan =
    workflow?.kind === "workflows"
      ? workflow.value.body
      : recordExample?.workflow_plan;
  const planOperations = workflowOperations(workflowPlan?.steps);
  const backendScope = selectedJob
    ? { operations: [selectedJob.request?.operation ?? "predict"] }
    : planOperations.length
      ? { operations: planOperations }
      : selectedJob === null
        ? null
        : { capability };
  const onBusyChange = options.onBusyChange;
  useLayoutEffect(() => {
    onBusyChange?.(state.pending !== null);
    return () => onBusyChange?.(false);
  }, [state.pending, onBusyChange]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (state.result) titleRef.current?.focus();
    else if (returning.current) {
      resultRef.current?.focus();
      returning.current = false;
    }
  }, [state.result]);
  const zh = language === "zh";
  const review = state.info?.pin?.review ?? state.info?.record_pin?.review;
  const receptorComparison = Boolean(
    state.result?.job?.status === "succeeded" &&
    hasReviewedReceptorComparison(state.info, state.result.job.id),
  );
  const highlight =
    state.result?.job?.id === state.info?.pin?.job_id &&
    state.result?.job?.status === "succeeded"
      ? (reviewedHighlight(state.info, language) ??
        (receptorComparison ? reviewedReceptorFinding(language) : null))
      : null;
  return (
    <section
      className={"module-template" + (state.result ? " is-preview" : "")}
      aria-label={zh ? "模块使用模板" : "Module usage template"}
    >
      {state.info ? (
        <ExampleToolbar
          info={state.info}
          capability={capability}
          backendScope={backendScope}
          selectedJob={selectedJob}
          language={language}
          previewing={Boolean(state.result)}
          active={options.active ?? true}
          loaded={state.loaded}
          pending={state.pending}
          titleRef={titleRef}
          resultRef={resultRef}
          onBack={onBack}
          onLoad={() => void state.loadTemplate()}
          onShowResult={() => void state.showResult()}
          onClear={state.clear}
          onClose={() => {
            returning.current = true;
            state.closeResult();
          }}
        />
      ) : (
        onBack && (
          <button type="button" className="text-button" onClick={onBack}>
            {zh ? "返回全部能力" : "Back to all capabilities"}
          </button>
        )
      )}
      <ExampleFeedback
        language={language}
        pending={state.loadingInfo ? "metadata" : state.pending}
        failure={state.failure}
        onRetry={state.retry}
      />
      {state.result && (
        <section
          className="module-example-result"
          aria-label={zh ? "模块内示例结果" : "In-module example results"}
        >
          {highlight && (
            <p className="example-review-highlight">
              <strong>{zh ? "案例关键结论：" : "Key finding: "}</strong>
              {highlight}
            </p>
          )}
          <TemplatePreviewContext.Provider value={true}>
            {state.result.job && (
              <ExampleResultSet
                key={state.result.job.id}
                job={state.result.job}
                initialCandidateId={
                  state.info?.pin?.initial_candidate_id ?? undefined
                }
                supporting={state.info?.pin?.supporting_evidence ?? []}
                stageNames={state.info?.supporting_stage_names}
                language={language}
                onStageChange={reportStage}
                stageSummary={
                  receptorComparison
                    ? (onStage) => (
                        <ReviewedReceptorComparison
                          language={language}
                          onStage={onStage}
                        />
                      )
                    : undefined
                }
              />
            )}
            {recordExample && (
              <ExampleResultSet
                primaryId={
                  "record:" +
                  recordExample.record?.pin.record_id +
                  ":" +
                  recordExample.record?.pin.record_sha256
                }
                primaryLabel={zh ? "研究结果" : "Study results"}
                primary={(onJobChange) => (
                  <ExampleRecordResult
                    example={recordExample}
                    language={language}
                    onJobChange={onJobChange}
                  />
                )}
                supporting={state.info?.record_pin?.supporting_evidence ?? []}
                stageNames={state.info?.supporting_stage_names}
                language={language}
                onStageChange={reportStage}
              />
            )}
          </TemplatePreviewContext.Provider>
          {state.result.job?.status === "succeeded" &&
            hasReviewedReferenceContacts(state.info, state.result.job.id) && (
              <ReviewedReferenceContacts language={language} />
            )}
          {review && (
            <details className="example-result-review">
              <summary>
                {zh
                  ? "示例结果的解读与适用范围"
                  : "Example interpretation and scope"}
              </summary>
              <p>{review.interpretation}</p>
              <p>{review.limitations}</p>
            </details>
          )}
        </section>
      )}
    </section>
  );
}
