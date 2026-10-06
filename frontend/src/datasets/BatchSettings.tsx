import type { Language } from "../types";
export interface BatchSettingsValue {
  exhaustiveness: number;
  num_modes: number;
  time_limit_seconds: number;
  autobox_add: number;
}
export const defaultBatchSettings: BatchSettingsValue = {
  exhaustiveness: 8,
  num_modes: 3,
  time_limit_seconds: 900,
  autobox_add: 4,
};
export function BatchSettings({
  value,
  onChange,
  language,
}: {
  value: BatchSettingsValue;
  onChange(value: BatchSettingsValue): void;
  language: Language;
}) {
  const zh = language === "zh";
  const fields: [keyof BatchSettingsValue, string, number[]][] = [
    ["exhaustiveness", zh ? "搜索充分度" : "Search effort", [2, 8, 16, 32]],
    [
      "num_modes",
      zh ? "每个分子的姿势数" : "Poses per molecule",
      [1, 2, 3, 5, 10],
    ],
    [
      "time_limit_seconds",
      zh ? "单分子时间上限（秒）" : "Time per molecule (s)",
      [300, 900, 1800],
    ],
    [
      "autobox_add",
      zh ? "参考配体周围范围（Å）" : "Reference-ligand padding (Å)",
      [2, 4, 6, 8],
    ],
  ];
  return (
    <details className="dataset-expert">
      <summary>{zh ? "专家微调" : "Expert settings"}</summary>
      <div className="dataset-field-grid">
        {fields.map(([key, label, choices]) => (
          <label key={key} className="field">
            {label}
            <select
              value={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: Number(e.target.value) })
              }
            >
              {[...new Set([...choices, value[key]])]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}
