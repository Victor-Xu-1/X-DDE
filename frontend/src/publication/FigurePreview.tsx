import type { Language } from "../types";
import type { useFigurePreview } from "./useFigurePreview";
import { FigureViewport } from "./FigureViewport";

export function FigurePreview({
  state,
  language,
  transparent,
  valid,
}: {
  state: ReturnType<typeof useFigurePreview>;
  language: Language;
  transparent: boolean;
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
        caption={zh ? "预览缩放不改变下载尺寸" : "Zoom is for preview only"}
        exportPreview
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
      {state.error && (
        <div role="alert">
          <p>
            {state.layoutError === "height"
              ? zh
                ? "当前版面太矮，无法同时容纳结构与色标。请选择 1:1 或 3:4。"
                : "This layout is too short for the structure and color key. Choose 1:1 or 3:4."
              : state.layoutError === "width"
                ? zh
                  ? "当前分子无法在所选宽度内清晰排布，请选择双栏（183 mm）或较小字号。"
                  : "This structure needs more space. Choose double column (183 mm) or a smaller printed type size."
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
