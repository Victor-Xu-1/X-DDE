import type { Language } from "../types";
import type { useFigurePreview } from "./useFigurePreview";
import { FigureViewport } from "./FigureViewport";

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
      <FigureViewport
        language={language}
        transparent={transparent}
        widthMm={widthMm}
        ready={state.ready}
      >
        {state.preview && (
          <img
            key={state.preview.id}
            src={state.preview.url}
            draggable={false}
            alt={
              zh
                ? "当前参数生成的原生图件"
                : "Native figure with the selected settings"
            }
            onLoad={() => state.decoded(state.preview!.id)}
            onError={() => state.failed(state.preview!.id)}
          />
        )}
        {!state.preview && (
          <div
            className="figure-preview-placeholder"
            data-error={state.error}
            aria-hidden="true"
          >
            <span>{state.error ? "×" : null}</span>
          </div>
        )}
      </FigureViewport>
      <p className="figure-preview-scale-note">
        {zh
          ? "放大仅影响预览；下载保留版面尺寸。"
          : "Viewing zoom does not change the downloaded print dimensions."}
      </p>
      {state.error && (
        <div role="alert">
          <p>
            {state.layoutError
              ? zh
                ? "当前分子无法在所选宽度内清晰排布，请选择双栏或较小字号。"
                : "This structure needs more space. Choose double column or a smaller printed type size."
              : zh
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
