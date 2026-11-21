import { useEffect, useId, useRef, useState } from "react";
import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import {
  defaultFigure,
  figureDimensions,
  figureAspect,
  structureScales,
  type FigureSettings,
} from "./settings";
import { useFigurePreview } from "./useFigurePreview";
import { FigurePreview } from "./FigurePreview";
import { figureIdentity } from "./figure-render-queue";
export function FigureDialog({
  language,
  sourceKey,
  sourceReady,
  filename,
  format,
  aspect,
  render,
  onClose,
  onStart,
  typography,
  molecular,
  structureFraming,
  autoStructureFraming = false,
}: {
  language: Language;
  sourceKey: string;
  sourceReady: boolean;
  filename: string;
  format: "png" | "svg";
  aspect: number;
  render(settings: FigureSettings): Promise<Blob>;
  onClose(): void;
  onStart?(): void;
  typography: boolean;
  molecular: boolean;
  structureFraming: boolean;
  autoStructureFraming?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [settings, setSettings] = useState<FigureSettings>(
    molecular ? { ...defaultFigure, shape: "square" } : defaultFigure,
  );
  const zh = language === "zh";
  let size: ReturnType<typeof figureDimensions> | null = null;
  try {
    size = figureDimensions(settings, figureAspect(settings, aspect));
  } catch {
    /* Show an actionable size choice below. */
  }
  const state = useFigurePreview({
    settings,
    sourceKey: figureIdentity(sourceKey, aspect),
    format,
    valid: !!size && sourceReady,
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
        <FigurePreview
          state={state}
          language={language}
          transparent={settings.transparent}
          valid={!!size}
        />
        <div className="figure-export-options">
          <fieldset>
            {molecular && (
              <label>
                {zh ? "图件比例" : "Panel layout"}
                <select
                  value={settings.shape ?? "viewport"}
                  onChange={(e) =>
                    update({ shape: e.target.value as FigureSettings["shape"] })
                  }
                >
                  <option value="square">1:1</option>
                  <option value="landscape">3:2</option>
                  <option value="portrait">3:4</option>
                  <option value="viewport">
                    {zh ? "跟随窗口" : "Viewport"}
                  </option>
                </select>
              </label>
            )}
            {structureFraming && (
              <label>
                {zh ? "结构大小" : "Structure size"}
                <select
                  value={
                    settings.structureScale ??
                    (autoStructureFraming ? "auto" : 1)
                  }
                  onChange={(event) =>
                    update({
                      structureScale: structureScales.find(
                        (scale) => scale === Number(event.target.value),
                      ),
                    })
                  }
                >
                  {autoStructureFraming && (
                    <option value="auto">
                      {zh ? "自动适配 A/B" : "Fit both panels"}
                    </option>
                  )}
                  {structureScales.map((scale) => (
                    <option key={scale} value={scale}>
                      {scale}×
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                <option value="89" title={zh ? "单栏" : "Single column"}>
                  89 mm
                </option>
                <option value="183" title={zh ? "双栏" : "Double column"}>
                  183 mm
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
                ? "图件过大，请选择 89 mm 或 300 dpi。"
                : "Figure is too large. Choose 89 mm or 300 dpi."}
          </p>
        </div>
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
