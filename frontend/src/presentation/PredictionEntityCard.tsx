import { DownOutlined } from "@ant-design/icons";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Language } from "../types";
import "./prediction-entity-card.css";

/** One presentation for editable entities; hidden inputs stay mounted and validated. */
export function PredictionEntityCard({
  title,
  index,
  kind,
  summary,
  controls,
  children,
  language,
}: {
  title: string;
  index: number;
  kind: string;
  summary: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  language: Language;
}) {
  const [expanded, setExpanded] = useState(true);
  const body = useId();
  const invalid = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (expanded && invalid.current) {
      const field = invalid.current;
      invalid.current = null;
      if (field.isConnected && !field.closest("[hidden]")) field.focus();
    }
  }, [expanded]);
  return (
    <article
      className="prediction-entity-card"
      data-entity-kind={kind}
      aria-label={title}
      onInvalidCapture={(event) => {
        const field = event.target as HTMLElement;
        if (expanded) {
          if (!field.closest("[hidden]")) field.focus();
        } else {
          invalid.current = field;
          setExpanded(true);
        }
      }}
    >
      <header className="prediction-entity-heading">
        <span className="prediction-entity-badge" aria-hidden="true">
          {index + 1}
        </span>
        <button
          type="button"
          className="prediction-entity-toggle"
          aria-controls={body}
          aria-expanded={expanded}
          aria-label={
            (language === "zh"
              ? expanded
                ? "收起 "
                : "展开 "
              : expanded
                ? "Collapse "
                : "Expand ") + title
          }
          onClick={() => setExpanded((value) => !value)}
        >
          <DownOutlined aria-hidden="true" />
          <strong>{title}</strong>
        </button>
        <small className="prediction-entity-material">{summary}</small>
        {controls && (
          <div className="prediction-entity-controls">{controls}</div>
        )}
      </header>
      <div className="prediction-entity-body" id={body} hidden={!expanded}>
        {children}
      </div>
    </article>
  );
}
