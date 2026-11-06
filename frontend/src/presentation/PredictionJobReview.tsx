import { useEffect, useState, type ReactNode } from "react";
import type { Job, Language } from "../types";
import { EnvironmentRecheck } from "../guided/EnvironmentRecheck";
import type { PreviewComponent } from "./PredictionEntityPreview";
import { PredictionJobOverview } from "./PredictionJobOverview";
import { PredictionReviewDialog } from "./PredictionReviewDialog";
import { researchError } from "./research-content";
import type { ScientificTask } from "../integrations/types";
import type { TaskRequest } from "../operations/types";
import "./prediction-job-review.css";

interface PredictionJobSnapshot<Task extends TaskRequest> {
  task: Task;
  components: PreviewComponent[];
}

export interface PredictionJobReviewActions<
  Task extends TaskRequest = ScientificTask,
> {
  language: Language;
  ready: boolean | undefined;
  unavailable: string;
  recheck?(): void;
  busy: boolean;
  error: string;
  confirm(send: () => Promise<Job | undefined>): Promise<void>;
  onClose(): void;
  submit(task: Task): Promise<Job | undefined>;
}
export function PredictionJobReview<
  Input,
  Task extends TaskRequest,
  Prepared extends PredictionJobSnapshot<Task>,
>({
  language,
  input,
  prepare,
  renderSettings,
  renderOverview,
  preparationError,
  summary,
  wide,
  ready,
  unavailable,
  recheck,
  busy,
  error,
  confirm,
  onClose,
  submit,
}: PredictionJobReviewActions<Task> & {
  input: Input;
  prepare(input: Input, signal: AbortSignal): Promise<Prepared>;
  renderSettings(prepared: Prepared): ReactNode;
  renderOverview?(prepared: Prepared): ReactNode;
  preparationError?: string | ((reason: string) => string);
  summary?(prepared: Prepared): ReactNode;
  wide?: boolean;
}) {
  const zh = language === "zh";
  const identity = JSON.stringify(input);
  const [state, setState] = useState<
    | { identity: string; result: Prepared }
    | { identity: string; error: string }
    | null
  >(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    void prepare(JSON.parse(identity) as Input, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setState({ identity, result });
      },
      (reason: unknown) => {
        if (!controller.signal.aborted)
          setState({
            identity,
            error: String(reason instanceof Error ? reason.message : reason),
          });
      },
    );
    return () => controller.abort();
  }, [identity, attempt, prepare]);
  const current = state?.identity === identity ? state : null;
  const prepared = current && "result" in current ? current.result : null;
  const availability = !ready && (
    <div className="job-review-availability">
      <p role="status" className="notice">
        {ready === undefined
          ? zh
            ? "正在检查计算环境…"
            : "Checking the calculation environment…"
          : unavailable}
      </p>
      <EnvironmentRecheck
        ready={ready}
        onRecheck={recheck}
        language={language}
        busy={busy}
      />
    </div>
  );

  return (
    <PredictionReviewDialog
      language={language}
      title={zh ? "预览任务" : "Preview job"}
      job
      wide={wide}
      busy={busy}
      onClose={onClose}
      actions={
        <button
          type="button"
          className="primary-button"
          disabled={!ready || !prepared || busy}
          onClick={() => {
            if (ready && prepared && !busy)
              void confirm(() => submit(prepared.task));
          }}
        >
          {busy
            ? zh
              ? "正在提交…"
              : "Submitting…"
            : zh
              ? "提交任务"
              : "Submit job"}
        </button>
      }
    >
      {!current && (
        <p role="status">
          {zh ? "正在核对研究文件…" : "Checking research files…"}
        </p>
      )}
      {current && "error" in current && (
        <div role="alert" className="error-box">
          <p>
            {(typeof preparationError === "function"
              ? preparationError(current.error)
              : preparationError) ??
              (zh
                ? "无法核对所选文件。请重试，或返回编辑更换材料。"
                : "The selected files could not be verified. Try again or return to edit them.")}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setState(null);
              retry((n) => n + 1);
            }}
          >
            {zh ? "重新核对文件" : "Check files again"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-box">
          {researchError(error, zh)}
        </p>
      )}
      {prepared && (
        <div className="job-review-grid">
          <PredictionJobOverview
            key={identity}
            language={language}
            name={prepared.task.name}
            components={prepared.components}
            summary={summary?.(prepared)}
            request={prepared.task}
            busy={busy}
            onEdit={onClose}
          >
            {renderOverview?.(prepared)}
          </PredictionJobOverview>
          <div className="job-review-sidebar">
            {renderSettings(prepared)}
            {availability}
          </div>
        </div>
      )}
      {!prepared && availability}
    </PredictionReviewDialog>
  );
}
