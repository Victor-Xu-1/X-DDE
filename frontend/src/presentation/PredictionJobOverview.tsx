import { useId, useState, type ReactNode } from "react";
import type { Language } from "../types";
import {
  PredictionEntityPreview,
  type PreviewComponent,
} from "./PredictionEntityPreview";
import { predictionEntitySummary } from "./PredictionEntitySummary";

/** A view of one verified request. Its owner remounts it when inputs change. */
export function PredictionJobOverview({
  language,
  name,
  components,
  summary,
  request,
  children,
  busy,
  onEdit,
}: {
  language: Language;
  name: string;
  components: PreviewComponent[];
  summary?: ReactNode;
  request: unknown;
  children?: ReactNode;
  busy: boolean;
  onEdit(): void;
}) {
  const zh = language === "zh";
  const id = useId();
  const [technical, setTechnical] = useState(false);
  return (
    <div className="job-review-primary">
      <div className="job-review-identity">
        <span className="job-review-avatar" aria-hidden="true">
          J
        </span>
        <div>
          <strong>{name}</strong>
          <span>
            {summary ?? (
              <>
                {components.length} {zh ? "个组分" : "entities"} ·{" "}
                {components.reduce((n, component) => n + component.count, 0)}{" "}
                {zh ? "条链/分子" : "chains/molecules"}
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          className="job-review-edit"
          disabled={busy}
          onClick={() => {
            if (!busy) onEdit();
          }}
        >
          {zh ? "编辑设置" : "Edit setup"}
        </button>
      </div>
      <section className="job-review-overview">
        <div
          className="job-review-tabs"
          role="group"
          aria-label={zh ? "任务预览视图" : "Job preview view"}
        >
          <button
            type="button"
            aria-pressed={!technical}
            aria-controls={`${id}-overview`}
            onClick={() => setTechnical(false)}
          >
            {zh ? "概览" : "Overview"}
          </button>
          <button
            type="button"
            aria-pressed={technical}
            aria-controls={`${id}-request`}
            onClick={() => setTechnical(true)}
          >
            {zh ? "提交内容" : "Request JSON"}
          </button>
        </div>
        <div id={`${id}-overview`} hidden={technical}>
          {children ?? (
            <div className="prediction-preview-entities">
              {components.map((item, index) => (
                <PredictionEntityPreview
                  key={index}
                  item={item}
                  index={index}
                  language={language}
                  showMetadata
                  summary={`${predictionEntitySummary(item, language)} · ${item.count} ${zh ? "份" : item.count === 1 ? "copy" : "copies"}`}
                />
              ))}
            </div>
          )}
        </div>
        <div
          id={`${id}-request`}
          className="job-review-payload"
          hidden={!technical}
        >
          <p>
            {zh
              ? "这是发送到 X-DDE 的请求。引擎输入由服务器另行生成。"
              : "This is the request sent to X-DDE. The server prepares the engine input separately."}
          </p>
          <pre
            tabIndex={0}
            aria-label={zh ? "X-DDE 提交请求" : "X-DDE submission request"}
          >
            {JSON.stringify(request, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}
