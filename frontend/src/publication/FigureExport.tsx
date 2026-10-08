import { useEffect, useId, useRef, useState } from "react";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import {
  defaultFigure,
  figureDimensions,
  type FigureSettings,
} from "./settings";
import { pngResolution } from "./png-resolution";
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
}: {
  language: Language;
  filename: string;
  format: "png" | "svg";
  aspect?: number | (() => number);
  render(settings: FigureSettings): Promise<Blob>;
  disabled?: boolean;
  label?: string;
  onStart?(): void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-button figure-export-trigger"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label ?? (language === "zh" ? "文献图导出" : "Export figure")} ↓
      </button>
      {open && (
        <ExportDialog
          language={language}
          filename={filename}
          format={format}
          aspect={typeof aspect === "function" ? aspect() : aspect}
          render={render}
          onStart={onStart}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function ExportDialog({
  language,
  filename,
  format,
  aspect,
  render,
  onClose,
  onStart,
}: {
  language: Language;
  filename: string;
  format: "png" | "svg";
  aspect: number;
  render(settings: FigureSettings): Promise<Blob>;
  onClose(): void;
  onStart?(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const active = useRef(true);
  const [settings, setSettings] = useState(defaultFigure),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const zh = language === "zh";
  let size: ReturnType<typeof figureDimensions> | null = null;
  try {
    size = figureDimensions(settings, aspect);
  } catch {
    /* Show an actionable size choice below. */
  }
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);
  const update = (value: Partial<FigureSettings>) =>
    setSettings((s) => ({ ...s, ...value }));
  async function exportFigure() {
    if (busy || !size) return;
    setBusy(true);
    setError(false);
    try {
      onStart?.();
      const native = await render(settings);
      if (native.type !== (format === "png" ? "image/png" : "image/svg+xml"))
        throw new Error("Unsupported native figure type.");
      const blob =
        format === "png" ? await pngResolution(native, settings.dpi) : native;
      if (!active.current) return;
      downloadBlob(blob, filename + "." + format);
      onClose();
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="figure-export-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={title}>{zh ? "导出文献图" : "Export research figure"}</h2>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          aria-label={zh ? "关闭" : "Close"}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <fieldset disabled={busy}>
        <label>
          {zh ? "版面宽度" : "Figure width"}
          <select
            value={settings.widthMm}
            onChange={(e) =>
              update({
                widthMm: Number(e.target.value) as FigureSettings["widthMm"],
              })
            }
          >
            <option value="89">
              {zh ? "单栏 · 89 mm" : "Single column · 89 mm"}
            </option>
            <option value="183">
              {zh ? "双栏 · 183 mm" : "Double column · 183 mm"}
            </option>
          </select>
        </label>
        {format === "png" ? (
          <label>
            {zh ? "清晰度" : "Resolution"}
            <select
              value={settings.dpi}
              onChange={(e) =>
                update({ dpi: Number(e.target.value) as FigureSettings["dpi"] })
              }
            >
              <option value="600">600 dpi</option>
              <option value="300">300 dpi</option>
            </select>
          </label>
        ) : null}
        <label>
          {zh ? "印刷字号" : "Printed type size"}
          <select
            value={settings.fontPt}
            onChange={(e) =>
              update({
                fontPt: Number(e.target.value) as FigureSettings["fontPt"],
              })
            }
          >
            {[7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
        <label className="figure-background">
          <input
            type="checkbox"
            checked={settings.transparent}
            onChange={(e) => update({ transparent: e.target.checked })}
          />
          {zh ? "透明背景" : "Transparent background"}
        </label>
      </fieldset>
      <p className="figure-output-spec">
        {size
          ? format === "png"
            ? `${size.width} × ${size.height} px · ${settings.dpi} dpi`
            : `${settings.widthMm} mm · ${settings.fontPt} pt · SVG`
          : zh
            ? "图件过大，请选择单栏或 300 dpi。"
            : "Figure is too large. Choose single column or 300 dpi."}
      </p>
      <p className="field-help">
        {zh
          ? "保留当前视角、结构和原始数值；导出参数仅影响图件。"
          : "Retains the current view, structures and original values. Export settings affect the figure only."}
      </p>
      {error && (
        <p role="alert">
          {zh
            ? "图件导出失败。请选择较低清晰度或重试。"
            : "Figure export failed. Choose a lower resolution or try again."}
        </p>
      )}
      <footer>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !size}
          onClick={() => {
            void exportFigure();
          }}
        >
          {busy ? (zh ? "正在生成…" : "Rendering…") : zh ? "导出" : "Export"}{" "}
          {format.toUpperCase()}
        </button>
      </footer>
    </dialog>
  );
}
