import type { ReactNode } from "react";
import type { Language } from "../types";
import { EnvironmentRecheck } from "./EnvironmentRecheck";

export function SinglePageReadiness({
  ready,
  unavailable,
  onRecheck,
  language,
  busy,
}: {
  ready: boolean | undefined;
  unavailable?: ReactNode;
  onRecheck?(): void;
  language: Language;
  busy: boolean;
}) {
  if (ready) return null;
  const zh = language === "zh";
  const status = (
    <span role="status">
      {ready === undefined
        ? zh
          ? "正在检查工具…"
          : "Checking tool…"
        : zh
          ? "工具尚未就绪"
          : "Tool is not ready"}
    </span>
  );
  return (
    <div className="single-page-readiness">
      {unavailable || onRecheck ? (
        <details>
          <summary>{status}</summary>
          <div className="single-page-readiness-details">
            {ready === false && unavailable}
            <EnvironmentRecheck
              ready={ready}
              onRecheck={onRecheck}
              language={language}
              busy={busy}
            />
          </div>
        </details>
      ) : status}
    </div>
  );
}
