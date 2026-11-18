import { useEffect, useRef } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { Job, Language } from "../types";
import { predictionMethodLabel } from "../presentation/PredictionResultHeader";
import type { ExampleInfo } from "./types";
import { templateGuide } from "./guide";

export function ExampleGuide({
  info,
  capability,
  language,
  previewing,
  selectedJob,
}: {
  info: ExampleInfo;
  capability: string;
  language: Language;
  previewing: boolean;
  selectedJob?: Job | null;
}) {
  const node = useRef<HTMLDetailsElement>(null);
  const zh = language === "zh";
  const label = zh ? "模板说明与来源" : "Template guide & sources";
  const guide = templateGuide(capability, language, info.study);
  const result = previewing ? selectedJob?.request : undefined;
  const model = result && predictionMethodLabel(result);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        node.current?.open &&
        event.target instanceof Node &&
        !node.current.contains(event.target)
      )
        node.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && node.current?.open) {
        node.current.open = false;
        node.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="example-guide" ref={node} key={capability}>
      <summary aria-label={label} title={label}>
        <InfoCircleOutlined aria-hidden="true" />
        <span className="example-guide-caption">
          {zh ? "案例说明" : "Case guide"}
        </span>
      </summary>
      <div className="example-guide-content">
        <strong>{info.case.label[zh ? 0 : 1]}</strong>
        {result?.name && (
          <dl className="example-result-source">
            <dt>{zh ? "对应任务" : "Source task"}</dt>
            <dd>{result.name}</dd>
            {model && (
              <>
                <dt>{zh ? "模型" : "Model"}</dt>
                <dd>{model}</dd>
              </>
            )}
          </dl>
        )}
        {previewing && <p>{guide.interpretation}</p>}
        <p>{info.case.description[zh ? 0 : 1]}</p>
        <ol>
          {guide.steps.slice(0, 3).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
        <div className="example-sources">
          <span>{zh ? "公开来源" : "Public sources"}</span>
          {info.case.sources.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {new URL(url).hostname}
            </a>
          ))}
        </div>
      </div>
    </details>
  );
}
