import {
  useExampleTemplate,
  type ExampleTemplateOptions,
} from "./useExampleTemplate";
import { templateGuide } from "./guide";
import { ExampleJobResult } from "./ExampleJobResult";
import { ExampleRecordResult } from "./ExampleRecordResult";
import { TemplatePreviewContext } from "./context";
import "./examples.css";
import { Hint } from "../guided/Hint";
export function ExampleActions(options: ExampleTemplateOptions) {
  const { capability, language } = options;
  const zh = language === "zh";
  const {
    info,
    busy,
    error,
    loaded,
    result,
    loadTemplate,
    showResult,
    closeResult,
    clear,
  } = useExampleTemplate(options);
  return (
    <section
      className="module-template"
      aria-label={zh ? "模块使用模板" : "Module usage template"}
    >
      <div className="example-actions">
        {info && (
          <>
            <span title={info.case.description[zh ? 0 : 1]}>
              {zh ? "真实模板：" : "Real template: "}
              {info.case.label[zh ? 0 : 1]}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void loadTemplate()}
            >
              {busy
                ? zh
                  ? "正在准备…"
                  : "Preparing…"
                : zh
                  ? "使用此模板"
                  : "Use this template"}
            </button>
            {(info.pin || info.record_pin) && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void showResult()}
              >
                {info.record_pin && !info.record_pin.computed_result_available
                  ? zh
                    ? "配置示例"
                    : "Setup example"
                  : zh
                    ? "示例结果"
                    : "Example results"}
              </button>
            )}
            {(loaded || result) && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={clear}
              >
                {zh ? "新建空白任务" : "New blank task"}
              </button>
            )}
            <details>
              <summary>
                {zh ? "模板说明与来源" : "Template guide & sources"}
              </summary>
              <p>{info.case.description[zh ? 0 : 1]}</p>
              <ol>
                {templateGuide(capability, language)
                  .steps.slice(0, 3)
                  .map((text) => (
                    <li key={text}>{text}</li>
                  ))}
              </ol>
              <ul>
                {info.case.sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {new URL(url).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      {result && (
        <section
          className="module-example-result"
          aria-label={zh ? "模块内示例结果" : "In-module example results"}
        >
          <div className="section-heading">
            <h2>
              {zh ? "示例结果" : "Example results"}
              <Hint label={zh ? "结果解读说明" : "Result interpretation help"}>
                {templateGuide(capability, language).interpretation}
              </Hint>
            </h2>
            <button
              type="button"
              className="secondary-button"
              onClick={closeResult}
            >
              {zh ? "返回任务填写" : "Return to task form"}
            </button>
          </div>
          <TemplatePreviewContext.Provider value={true}>
            {result.job && (
              <ExampleJobResult job={result.job} language={language} />
            )}
            {result.example && (
              <ExampleRecordResult
                example={result.example}
                language={language}
              />
            )}
          </TemplatePreviewContext.Provider>
        </section>
      )}
    </section>
  );
}
