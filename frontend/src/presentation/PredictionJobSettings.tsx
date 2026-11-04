import type { ReactNode } from "react";
import type { Language } from "../types";

export function PredictionJobSettings({
  language,
  rows,
  children,
}: {
  language: Language;
  rows: ReadonlyArray<readonly [string, ReactNode]>;
  children?: ReactNode;
}) {
  const title = language === "zh" ? "预测设置" : "Prediction settings";
  return (
    <aside className="job-review-settings" aria-label={title}>
      <h3>{title}</h3>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </aside>
  );
}
