import type { RefObject } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { ExampleInfo } from "./types";
import { ExampleGuide } from "./ExampleGuide";
import { Hint } from "../guided/Hint";
import { templateGuide } from "./guide";

export function ExampleToolbar({
  info,
  capability,
  language,
  previewing,
  loaded,
  pending,
  titleRef,
  resultRef,
  onLoad,
  onShowResult,
  onClear,
  onClose,
  onBack,
}: {
  info: ExampleInfo;
  capability: string;
  language: Language;
  previewing: boolean;
  loaded: boolean;
  pending: "template" | "result" | null;
  titleRef: RefObject<HTMLHeadingElement | null>;
  resultRef: RefObject<HTMLButtonElement | null>;
  onLoad(): void;
  onShowResult(): void;
  onClear(): void;
  onClose(): void;
  onBack?(): void;
}) {
  const zh = language === "zh",
    busy = pending !== null;
  const setup = Boolean(
    info.record_pin && !info.record_pin.computed_result_available,
  );
  const name = info.case.label[zh ? 0 : 1];
  return (
    <div
      className={
        "example-toolbar" + (previewing ? " example-preview-toolbar" : "")
      }
    >
      <div className="example-case">
        {onBack && (
          <button
            type="button"
            className="example-back text-button"
            aria-label={zh ? "返回全部能力" : "Back to all capabilities"}
            title={zh ? "返回全部能力" : "Back to all capabilities"}
            onClick={onBack}
          >
            <ArrowLeftOutlined aria-hidden="true" />
          </button>
        )}
        {previewing ? (
          <div className="example-case-title">
            <h2 ref={titleRef} tabIndex={-1}>
              {name}
            </h2>
            <span className="example-result-kind">
              {setup
                ? zh
                  ? "配置示例"
                  : "Setup example"
                : zh
                  ? "公开示例"
                  : "Public example"}
            </span>
            <Hint label={zh ? "结果解读说明" : "Result interpretation help"}>
              {templateGuide(capability, language).interpretation}
            </Hint>
          </div>
        ) : (
          <span
            className="example-case-name"
            title={info.case.description[zh ? 0 : 1]}
          >
            <span className="example-case-caption">
              {zh ? "真实案例" : "Real case"}
            </span>
            {name}
          </span>
        )}
      </div>
      <div className="example-controls">
        <button
          type="button"
          className={previewing ? "text-button" : "secondary-button"}
          disabled={busy}
          onClick={onLoad}
        >
          {pending === "template"
            ? zh
              ? "正在准备模板…"
              : "Preparing template…"
            : zh
              ? "使用此模板"
              : "Use this template"}
        </button>
        {previewing ? (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            {zh ? "返回任务填写" : "Return to task form"}
          </button>
        ) : (
          (info.pin || info.record_pin) && (
            <button
              ref={resultRef}
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={onShowResult}
            >
              {pending === "result"
                ? zh
                  ? "正在打开示例…"
                  : "Opening example…"
                : setup
                  ? zh
                    ? "配置示例"
                    : "Setup example"
                  : zh
                    ? "示例结果"
                    : "Example results"}
            </button>
          )
        )}
        {loaded && !previewing && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onClear}
          >
            {zh ? "新建空白任务" : "New blank task"}
          </button>
        )}
        <ExampleGuide info={info} capability={capability} language={language} />
      </div>
    </div>
  );
}
