import type { RefObject } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { Job, Language } from "../types";
import type { ExampleInfo } from "./types";
import { ExampleGuide } from "./ExampleGuide";
import { TaskBackendControl } from "../utilities/TaskBackendControl";
import type { BackendControlScope } from "../utilities/backend-control-scope";

export function ExampleToolbar({
  info,
  capability,
  backendScope,
  selectedJob,
  language,
  previewing,
  active,
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
  backendScope: BackendControlScope | null;
  selectedJob?: Job | null;
  language: Language;
  previewing: boolean;
  active: boolean;
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
  const kind =
    info.study && !info.computed_result_available && !info.record_pin
      ? zh
        ? "研究材料预览"
        : "Reference input preview"
      : setup
        ? zh
          ? "配置示例"
          : "Setup example"
        : zh
          ? "公开示例"
          : "Public example";
  const guide = (
    <ExampleGuide
      info={info}
      capability={capability}
      language={language}
      previewing={previewing}
      selectedJob={selectedJob}
    />
  );
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
          </div>
        ) : (
          <span
            className="example-case-name"
            title={info.case.description[zh ? 0 : 1]}
          >
            <span className="example-case-caption">
              {info.study
                ? zh
                  ? "研究模板"
                  : "Research template"
                : zh
                  ? "真实案例"
                  : "Real case"}
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
          (info.pin || info.record_pin || info.study) && (
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
                : info.study && !info.pin && !info.record_pin
                  ? zh
                    ? "查看研究材料"
                    : "Preview study inputs"
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
        {previewing ? (
          <div className="example-result-context">
            <span className="example-result-kind">{kind}</span>
            {guide}
            {active && backendScope && (
              <TaskBackendControl
                language={language}
                scope={backendScope}
                placement="example"
              />
            )}
          </div>
        ) : (
          guide
        )}
      </div>
    </div>
  );
}
