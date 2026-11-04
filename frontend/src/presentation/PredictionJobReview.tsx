import { useEffect, useState, type ReactNode } from "react";
import type { Job, Language } from "../types";
import { EnvironmentRecheck } from "../guided/EnvironmentRecheck";
import {
  PredictionEntityPreview,
  type PreviewComponent,
} from "./PredictionEntityPreview";
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
  preparationError?: string;
}) {
  const zh = language === "zh";
  const identity = JSON.stringify(input);
  const [state, setState] = useState<
    | { identity: string; result: Prepared }
    | { identity: string; error: string }
    | null
  >(null);
  const [attempt, retry] = useState(0);
  const [technical, setTechnical] = useState(false);
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

  return (
    <PredictionReviewDialog
      language={language}
      title={zh ? "预览任务" : "Preview job"}
      job
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
            {preparationError ??
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
          <div className="job-review-primary">
            <div className="job-review-identity">
              <strong>{prepared.task.name}</strong>
              <span>
                {prepared.components.length} {zh ? "个组分" : "entities"} ·{" "}
                {prepared.components.reduce(
                  (n, component) => n + component.count,
                  0,
                )}{" "}
                {zh ? "条链/分子" : "chains/molecules"}
              </span>
            </div>
            <div
              className="job-review-tabs"
              role="group"
              aria-label={zh ? "任务预览视图" : "Job preview view"}
            >
              <button
                type="button"
                aria-pressed={!technical}
                onClick={() => setTechnical(false)}
              >
                {zh ? "概览" : "Overview"}
              </button>
              <button
                type="button"
                aria-pressed={technical}
                onClick={() => setTechnical(true)}
              >
                {zh ? "提交内容" : "Request JSON"}
              </button>
            </div>
            {technical ? (
              <div className="job-review-payload">
                <p>
                  {zh
                    ? "这是发送到 X-DDE 的请求。引擎输入由服务器另行生成。"
                    : "This is the request sent to X-DDE. The server prepares the engine input separately."}
                </p>
                <pre
                  tabIndex={0}
                  aria-label={
                    zh ? "X-DDE 提交请求" : "X-DDE submission request"
                  }
                >
                  {JSON.stringify(prepared.task, null, 2)}
                </pre>
              </div>
            ) : renderOverview ? (
              renderOverview(prepared)
            ) : (
              <div className="prediction-preview-entities">
                {prepared.components.map((item, index) => (
                  <PredictionEntityPreview
                    key={index}
                    item={item}
                    index={index}
                    language={language}
                    initiallyExpanded={false}
                  />
                ))}
              </div>
            )}
          </div>
          {renderSettings(prepared)}
        </div>
      )}
      {!ready && (
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
      )}
    </PredictionReviewDialog>
  );
}
