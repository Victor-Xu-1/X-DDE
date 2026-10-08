import { useEffect, useRef } from "react";
import {
  useExampleTemplate,
  type ExampleTemplateOptions,
} from "./useExampleTemplate";
import { ExampleJobResult } from "./ExampleJobResult";
import { ExampleRecordResult } from "./ExampleRecordResult";
import { ExampleToolbar } from "./ExampleToolbar";
import { ExampleFeedback } from "./ExampleFeedback";
import { TemplatePreviewContext } from "./context";
import "./examples.css";

export function ExampleActions(
  options: ExampleTemplateOptions & { onBack?(): void },
) {
  const { capability, language, onBack } = options;
  const state = useExampleTemplate(options);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const returning = useRef(false);
  useEffect(() => {
    if (state.result) titleRef.current?.focus();
    else if (returning.current) {
      resultRef.current?.focus();
      returning.current = false;
    }
  }, [state.result]);
  const zh = language === "zh";
  return (
    <section
      className={"module-template" + (state.result ? " is-preview" : "")}
      aria-label={zh ? "模块使用模板" : "Module usage template"}
    >
      {state.info ? (
        <ExampleToolbar
          info={state.info}
          capability={capability}
          language={language}
          previewing={Boolean(state.result)}
          loaded={state.loaded}
          pending={state.pending}
          titleRef={titleRef}
          resultRef={resultRef}
          onBack={onBack}
          onLoad={() => void state.loadTemplate()}
          onShowResult={() => void state.showResult()}
          onClear={state.clear}
          onClose={() => {
            returning.current = true;
            state.closeResult();
          }}
        />
      ) : (
        onBack && (
          <button type="button" className="text-button" onClick={onBack}>
            {zh ? "返回全部能力" : "Back to all capabilities"}
          </button>
        )
      )}
      <ExampleFeedback
        language={language}
        pending={state.loadingInfo ? "metadata" : state.pending}
        failure={state.failure}
        onRetry={state.retry}
      />
      {state.result && (
        <section
          className="module-example-result"
          aria-label={zh ? "模块内示例结果" : "In-module example results"}
        >
          <TemplatePreviewContext.Provider value={true}>
            {state.result.job && (
              <ExampleJobResult job={state.result.job} language={language} />
            )}
            {state.result.example && (
              <ExampleRecordResult
                example={state.result.example}
                language={language}
              />
            )}
          </TemplatePreviewContext.Provider>
        </section>
      )}
    </section>
  );
}
