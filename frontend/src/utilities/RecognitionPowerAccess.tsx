import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Language } from "../types";
import { ImageRecognition } from "./ImageRecognition";

/** The embedded workbench owns the real power switch and task safeguards. */
export function RecognitionPowerAccess({
  language,
  disabled,
}: {
  language: Language;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useId();
  const label = language === "zh" ? "识别服务开关" : "Recognition power";

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    panel?.showModal();
    const close = () => panel?.close();
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        className="text-button"
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="image-molecule-dialog recognition-power-dialog"
            aria-labelledby={title}
            onClose={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <header>
              <h2 id={title}>{label}</h2>
              <button
                type="button"
                className="secondary-button"
                onClick={() => dialog.current?.close()}
              >
                {language === "zh" ? "返回任务" : "Back to task"}
              </button>
            </header>
            <ImageRecognition language={language} />
          </dialog>,
          document.body,
        )}
    </>
  );
}
