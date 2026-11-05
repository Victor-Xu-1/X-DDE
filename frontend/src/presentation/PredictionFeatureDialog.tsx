import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Language } from "../types";

function activeSource(element: HTMLElement | null) {
  return Boolean(
    element?.isConnected &&
    !element.closest("[hidden],[aria-hidden='true']") &&
    !element.matches(":disabled"),
  );
}

/** Outside the task form: Enter cannot implicitly advance or submit its steps. */
export function PredictionFeatureDialog({
  language,
  children,
  save,
  cancel,
  valid,
  invoker,
}: {
  language: Language;
  children: ReactNode;
  save(): void;
  cancel(): void;
  valid: boolean;
  invoker: HTMLElement | null;
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef(cancel);
  const origin = useRef(invoker);
  cancelRef.current = cancel;
  origin.current = invoker;
  const zh = language === "zh";
  useEffect(() => {
    const element = dialog.current!;
    const trigger = origin.current;
    if (!activeSource(trigger)) {
      cancelRef.current();
      return;
    }
    element.showModal();
    close.current?.focus();
    const observer = new MutationObserver(() => {
      if (!activeSource(trigger)) cancelRef.current();
    });
    for (let parent = trigger; parent; parent = parent.parentElement)
      observer.observe(parent, {
        attributes: true,
        attributeFilter: ["hidden", "aria-hidden", "disabled"],
      });
    return () => {
      observer.disconnect();
      if (element.open) element.close();
      if (activeSource(trigger) && !document.querySelector("dialog[open]"))
        trigger?.focus();
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
          onClick={() => {
            if (!activeSource(origin.current)) {
              cancel();
              return;
            }
            save();
          }}
        >
          {zh ? "保存" : "Save"}
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
