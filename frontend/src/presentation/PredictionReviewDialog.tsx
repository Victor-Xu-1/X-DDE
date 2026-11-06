import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Language } from "../types";
import "./prediction-input-preview.css";

export function PredictionReviewDialog({
  language,
  title,
  children,
  actions,
  onClose,
  busy = false,
  job = false,
  wide = false,
  historical = false,
}: {
  language: Language;
  title: string;
  children: ReactNode | ((dismiss: () => void) => ReactNode);
  actions?: ReactNode;
  onClose(): void;
  busy?: boolean;
  job?: boolean;
  wide?: boolean;
  historical?: boolean;
}) {
  const zh = language === "zh";
  const id = useId();
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
    if (busy) return;
    dialog.current?.close();
    onClose();
  }
  return (
    <dialog
      className={`prediction-input-preview${job ? " prediction-job-preview" : ""}${wide ? " prediction-review-wide" : ""}${historical ? " prediction-history-input" : ""}`}
      ref={dialog}
      aria-labelledby={id}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        dismiss();
      }}
    >
      <header>
        <div>
          <h2 id={id} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {!historical && (
            <span className="prediction-preview-status">
              {zh ? "尚未提交" : "Not submitted"}
            </span>
          )}
          {job && (
            <p className="job-review-description">
              {zh
                ? "核对本次任务的研究材料与计算设置。"
                : "Review the research inputs and settings for this task."}
            </p>
          )}
        </div>
        <button
          type="button"
          className="icon-button"
          disabled={busy}
          onClick={dismiss}
          aria-label={zh ? "关闭输入预览" : "Close input preview"}
        >
          ×
        </button>
      </header>
      <div className="prediction-input-preview-body">
        {typeof children === "function" ? children(dismiss) : children}
      </div>
      <footer>
        {historical && actions}
        <button
          type="button"
          className={actions ? "secondary-button" : "primary-button"}
          disabled={busy}
          onClick={dismiss}
        >
          {historical
            ? zh
              ? "关闭"
              : "Close"
            : zh
              ? "返回编辑"
              : "Back to edit"}
        </button>
        {!historical && actions}
      </footer>
    </dialog>
  );
}
