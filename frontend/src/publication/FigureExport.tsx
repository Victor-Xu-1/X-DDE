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
}) {
  const [open, setOpen] = useState(false),
    [inflight, setInflight] = useState(false);
  const locked = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
