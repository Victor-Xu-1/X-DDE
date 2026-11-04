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
}: {
  language: Language;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose(): void;
  busy?: boolean;
  job?: boolean;
  wide?: boolean;
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
      className={`prediction-input-preview${job ? " prediction-job-preview" : ""}${wide ? " prediction-review-wide" : ""}`}
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
          <span className="prediction-preview-status">
            {zh ? "尚未提交" : "Not submitted"}
          </span>
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
      <div className="prediction-input-preview-body">{children}</div>
      <footer>
        <button
          type="button"
          className={actions ? "secondary-button" : "primary-button"}
          disabled={busy}
          onClick={dismiss}
        >
          {zh ? "返回编辑" : "Back to edit"}
        </button>
        {actions}
      </footer>
    </dialog>
  );
}
