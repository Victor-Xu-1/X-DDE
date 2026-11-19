import { useEffect, useRef, useState } from "react";
import { PictureOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { FigureSettings } from "./settings";
import { FigureDialog } from "./FigureDialog";
import { figureIdentity } from "./figure-render-queue";
import "./publication.css";
export function FigureExport({
  language,
  sourceKey,
  filename,
  format,
  aspect = 1.5,
  render,
  disabled = false,
  sourceReady = true,
  label,
  onStart,
  typography = format === "svg",
  molecular = false,
  structureFraming = false,
  autoStructureFraming = false,
  compactTrigger = false,
}: {
  language: Language;
  sourceKey: string;
  filename: string;
  format: "png" | "svg";
  aspect?: number | (() => number);
  render(settings: FigureSettings): Promise<Blob>;
  disabled?: boolean;
  sourceReady?: boolean;
  label?: string;
  onStart?(): void;
  typography?: boolean;
  molecular?: boolean;
  structureFraming?: boolean;
  autoStructureFraming?: boolean;
  compactTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [inflight, setInflight] = useState(false);
  const locked = useRef(false),
    mounted = useRef(true);
  const trigger = useRef<HTMLButtonElement>(null),
    restoreFocus = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open && restoreFocus.current && !inflight) {
      restoreFocus.current = false;
      if (
        document.activeElement === document.body ||
        document.activeElement == null
      )
        trigger.current?.focus({ preventScroll: true });
    }
  }, [open, inflight]);
  function close() {
    restoreFocus.current = true;
    setOpen(false);
  }
  async function nativeRender(settings: FigureSettings) {
    if (locked.current)
      throw new Error("A native figure is already being rendered.");
    locked.current = true;
    setInflight(true);
    try {
      return await render(settings);
    } finally {
      locked.current = false;
      if (mounted.current) setInflight(false);
    }
  }
  const buttonLabel =
    (label ?? (language === "zh" ? "文献图导出" : "Export figure")) + " ↓";
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="text-button figure-export-trigger"
        aria-label={compactTrigger ? buttonLabel : undefined}
        disabled={disabled || !sourceReady || inflight}
        onClick={() => setOpen(true)}
      >
        {compactTrigger ? (
          <>
            <PictureOutlined
              className="viewer-figure-icon"
              aria-hidden="true"
            />
            <span className="viewer-figure-label">{buttonLabel}</span>
          </>
        ) : (
          buttonLabel
        )}
      </button>
      {open && (
        <FigureDialog
          sourceReady={sourceReady}
          sourceKey={figureIdentity(
            sourceKey,
            filename,
            format,
            typography,
            molecular,
            structureFraming,
          )}
          language={language}
          filename={filename}
          format={format}
          aspect={typeof aspect === "function" ? aspect() : aspect}
          render={nativeRender}
          onStart={onStart}
          typography={typography}
          molecular={molecular}
          structureFraming={structureFraming}
          autoStructureFraming={autoStructureFraming}
          onClose={close}
        />
      )}
    </>
  );
}
