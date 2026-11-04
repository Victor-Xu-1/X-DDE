import { useEffect, useId, useRef } from "react";
import type { Language } from "../types";
import {
  PredictionEntityPreview,
  type PreviewComponent,
} from "./PredictionEntityPreview";
import "./prediction-input-preview.css";
import { predictionSettingsSummary } from "./prediction-settings-summary";

/** Read-only projection of the current form, independent of admission and task execution. */
export function PredictionInputPreview({
  components,
  model,
  seeds,
  samples,
  language,
  onClose,
}: {
  components: PreviewComponent[];
  model: string;
  seeds: number[];
  samples: number;
  language: Language;
  onClose(): void;
}) {
  const zh = language === "zh";
  const summary = predictionSettingsSummary(seeds, samples, zh);
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  function dismiss() {
    dialog.current?.close();
    onClose();
  }
  return (
    <dialog
      className="prediction-input-preview"
      ref={dialog}
      aria-labelledby={title}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        dismiss();
      }}
    >
      <header>
        <div>
          <h2 id={title} ref={heading} tabIndex={-1}>
            {zh ? "预览研究输入" : "Preview study inputs"}
          </h2>
          <span className="prediction-preview-status">
            {zh ? "尚未提交" : "Not submitted"}
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={dismiss}
          aria-label={zh ? "关闭输入预览" : "Close input preview"}
        >
          ×
        </button>
      </header>
      <div className="prediction-input-preview-body">
        <dl className="prediction-preview-settings">
          <div>
            <dt>{zh ? "后端模型" : "Prediction model"}</dt>
            <dd>{model}</dd>
          </div>
          <div>
            <dt>{zh ? "随机种子" : "Seeds"}</dt>
            <dd>{summary.seeds}</dd>
          </div>
          <div>
            <dt>{zh ? "请求构象" : "Requested structures"}</dt>
            <dd>{summary.structures}</dd>
          </div>
        </dl>
        <div className="prediction-preview-entities">
          {components.map((item, index) => (
            <PredictionEntityPreview
              key={`${item.kind}-${index}`}
              item={item}
              index={index}
              language={language}
            />
          ))}
          {components.length === 0 && (
            <p>{zh ? "尚未填写研究材料" : "No study inputs yet"}</p>
          )}
        </div>
      </div>
      <footer>
        <button type="button" className="primary-button" onClick={dismiss}>
          {zh ? "返回编辑" : "Back to edit"}
        </button>
      </footer>
    </dialog>
  );
}
