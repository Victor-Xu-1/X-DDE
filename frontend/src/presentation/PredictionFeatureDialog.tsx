import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Language } from "../types";

/** Outside the task form: Enter cannot implicitly advance or submit its steps. */
export function PredictionFeatureDialog({
  language,
  children,
  save,
  cancel,
  valid,
}: {
  language: Language;
  children: ReactNode;
  save(): void;
  cancel(): void;
  valid: boolean;
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const zh = language === "zh";
  useEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const hidden = () =>
      Boolean(trigger?.closest("[hidden],[aria-hidden='true']"));
    if (hidden()) {
      cancelRef.current();
      return;
    }
    element.showModal();
    close.current?.focus();
    const observer = new MutationObserver(() => {
      if (hidden()) cancelRef.current();
    });
    for (
      let parent = trigger?.parentElement;
      parent;
      parent = parent.parentElement
    )
      observer.observe(parent, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden"],
      });
    return () => {
      observer.disconnect();
      if (element.open) element.close();
      if (
        trigger?.isConnected &&
        !hidden() &&
        !trigger.matches(":disabled") &&
        !document.querySelector("dialog[open]")
      )
        trigger.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="prediction-feature-dialog"
      aria-labelledby={id}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <header>
        <h2 id={id}>{zh ? "MSA 设置" : "MSA settings"}</h2>
        <button
          ref={close}
          type="button"
          aria-label={zh ? "关闭 MSA 设置" : "Close MSA settings"}
          onClick={cancel}
        >
          ×
        </button>
      </header>
      <div className="prediction-feature-dialog-body">{children}</div>
      <footer>
        <button type="button" onClick={cancel}>
          {zh ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          className="feature-save"
          disabled={!valid}
          onClick={save}
        >
          {zh ? "保存" : "Save"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
