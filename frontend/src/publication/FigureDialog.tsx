import { useEffect, useId, useRef, useState } from "react";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import {
  defaultFigure,
  figureDimensions,
  type FigureSettings,
} from "./settings";
import { useFigurePreview } from "./useFigurePreview";
import { FigurePreview } from "./FigurePreview";
export function FigureDialog({
  language,
  filename,
  format,
  aspect,
  render,
  onClose,
  onStart,
  typography,
}: {
  language: Language;
  filename: string;
  format: "png" | "svg";
  aspect: number;
  render(settings: FigureSettings): Promise<Blob>;
  onClose(): void;
  onStart?(): void;
  typography: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [settings, setSettings] = useState(defaultFigure);
  const zh = language === "zh";
  let size: ReturnType<typeof figureDimensions> | null = null;
  try {
    size = figureDimensions(settings, aspect);
  } catch {
    /* Show an actionable size choice below. */
  }
  const state = useFigurePreview({
    settings,
    format,
    valid: !!size,
    render,
    onStart,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = (value: Partial<FigureSettings>) =>
    setSettings((s) => ({ ...s, ...value }));
  function exportFigure() {
    if (!state.ready || !state.preview || !size) return;
    downloadBlob(state.preview.blob, filename + "." + format);
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="figure-export-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={title}>{zh ? "导出文献图" : "Export research figure"}</h2>
        <button
          type="button"
          className="text-button"
          aria-label={zh ? "关闭" : "Close"}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="figure-export-layout">
        <div className="figure-export-options">
          <fieldset>
            <label>
              {zh ? "版面宽度" : "Figure width"}
              <select
                value={settings.widthMm}
                onChange={(e) =>
                  update({
                    widthMm: Number(
                      e.target.value,
                    ) as FigureSettings["widthMm"],
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
                    update({
                      dpi: Number(e.target.value) as FigureSettings["dpi"],
                    })
                  }
                >
                  <option value="600">600 dpi</option>
                  <option value="300">300 dpi</option>
                </select>
              </label>
            ) : null}
            {typography && (
              <label>
                {zh ? "印刷字号" : "Printed type size"}
                <select
                  value={settings.fontPt}
                  onChange={(e) =>
                    update({
                      fontPt: Number(
                        e.target.value,
                      ) as FigureSettings["fontPt"],
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
            )}
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
        </div>
        <FigurePreview
          state={state}
          language={language}
          transparent={settings.transparent}
          widthMm={settings.widthMm}
          valid={!!size}
        />
      </div>
      <footer>
        <button
          type="button"
          className="primary-button"
          disabled={!state.ready || !size}
          onClick={exportFigure}
        >
          {zh ? "导出" : "Export"} {format.toUpperCase()}
        </button>
      </footer>
    </dialog>
  );
}
