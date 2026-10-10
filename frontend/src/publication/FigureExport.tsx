import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import type { FigureSettings } from "./settings";
import { FigureDialog } from "./FigureDialog";
import "./publication.css";
export function FigureExport({
  language,
  filename,
  format,
  aspect = 1.5,
  render,
  disabled = false,
  label,
  onStart,
  typography = format === "svg",
  molecular = false,
}: {
  language: Language;
  filename: string;
  format: "png" | "svg";
  aspect?: number | (() => number);
  render(settings: FigureSettings): Promise<Blob>;
  disabled?: boolean;
  label?: string;
  onStart?(): void;
  typography?: boolean;
  molecular?: boolean;
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
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="text-button figure-export-trigger"
        disabled={disabled || inflight}
        onClick={() => setOpen(true)}
      >
        {label ?? (language === "zh" ? "文献图导出" : "Export figure")} ↓
      </button>
      {open && (
        <FigureDialog
          language={language}
          filename={filename}
          format={format}
          aspect={typeof aspect === "function" ? aspect() : aspect}
          render={nativeRender}
          onStart={onStart}
          typography={typography}
          molecular={molecular}
          onClose={close}
        />
      )}
    </>
  );
}
