import type { ReactNode } from "react";
import type { Language } from "../types";

type SettingRow = readonly [string, ReactNode];

function SettingRows({ rows }: { rows: ReadonlyArray<SettingRow> }) {
  return (
    <dl>
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PredictionJobSettings({
  language,
  rows,
  secondaryRows = [],
  children,
}: {
  language: Language;
  rows: ReadonlyArray<SettingRow>;
  secondaryRows?: ReadonlyArray<SettingRow>;
  children?: ReactNode;
}) {
  const title = language === "zh" ? "预测设置" : "Prediction settings";
  return (
    <aside className="job-review-settings" aria-label={title}>
      <h3>{title}</h3>
      <SettingRows rows={rows} />
      {secondaryRows.length > 0 && (
        <details className="job-review-compute-details">
          <summary>
            {language === "zh" ? "计算细节" : "Computation details"}
          </summary>
          <SettingRows rows={secondaryRows} />
        </details>
      )}
      {children}
    </aside>
  );
}
