import type { Language } from "../types";
import type { useFigurePreview } from "./useFigurePreview";

export function FigurePreview({
  state,
  language,
  transparent,
  widthMm,
  valid,
}: {
  state: ReturnType<typeof useFigurePreview>;
  language: Language;
  transparent: boolean;
  widthMm: number;
  valid: boolean;
}) {
  const zh = language === "zh";
  return (
    <section
      className="figure-preview"
      data-preparing={valid && !state.ready && !state.error}
      aria-label={zh ? "图件预览" : "Figure preview"}
      aria-busy={valid && !state.ready && !state.error}
    >
      <header>
        <h3>{zh ? "图件预览" : "Figure preview"}</h3>
        <span role="status">
          {!valid
            ? zh
              ? "调整尺寸"
              : "Adjust size"
            : state.error
              ? zh
                ? "暂不可用"
                : "Unavailable"
              : state.ready
                ? zh
                  ? "可导出"
                  : "Ready"
                : zh
                  ? "正在生成…"
                  : "Preparing…"}
        </span>
      </header>
      <div
        className={`figure-preview-sheet ${transparent ? "is-transparent" : ""}`}
      >
        {state.preview && (
          <img
            key={state.preview.url}
            src={state.preview.url}
            alt={
              zh
                ? "当前参数生成的原生图件"
                : "Native figure with the selected settings"
            }
            onLoad={() => state.decoded(state.preview!.url)}
            onError={() => state.failed(state.preview!.url)}
          />
        )}
        {!state.preview && (
          <div className="figure-preview-placeholder" aria-hidden="true">
            <span />
          </div>
        )}
      </div>
      <p className="figure-preview-width">{widthMm} mm</p>
      <p className="figure-preview-scale-note">
        {zh
          ? "预览适应窗口；下载保留所选版面参数。"
          : "Preview fits this window; the download retains your print settings."}
      </p>
      {state.error && (
        <div role="alert">
          <p>
            {zh
              ? "预览未能生成，请降低清晰度或重试。"
              : "Preview could not be prepared. Reduce resolution or try again."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={state.retry}
          >
            {zh ? "重新生成预览" : "Retry preview"}
          </button>
        </div>
      )}
    </section>
  );
}
