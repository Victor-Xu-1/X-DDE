import { useEffect, useRef } from "react";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import type { ExampleInfo } from "./types";
import { templateGuide } from "./guide";

export function ExampleGuide({
  info,
  capability,
  language,
}: {
  info: ExampleInfo;
  capability: string;
  language: Language;
}) {
  const node = useRef<HTMLDetailsElement>(null);
  const zh = language === "zh";
  const label = zh ? "模板说明与来源" : "Template guide & sources";
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
        <span>{zh ? "案例说明" : "Case guide"}</span>
      </summary>
      <div className="example-guide-content">
        <strong>{info.case.label[zh ? 0 : 1]}</strong>
        <p>{info.case.description[zh ? 0 : 1]}</p>
        <ol>
          {templateGuide(capability, language)
            .steps.slice(0, 3)
            .map((text) => (
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
