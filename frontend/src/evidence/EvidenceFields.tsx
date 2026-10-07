import type { Language } from "../types";
import type { Columns, Conditions, Endpoint } from "./types";
export function ColumnFields({
  columns,
  names,
  language,
  onChange,
  optional = false,
}: {
  columns: Columns;
  names: string[];
  language: Language;
  onChange(value: Columns): void;
  optional?: boolean;
}) {
  const zh = language === "zh";
  const labels: Record<keyof Columns, [string, string]> = {
    compound: ["化合物/材料编号", "Compound/material ID"],
    value: ["实测值", "Reported value"],
    relation: ["大于/小于等符号", "Reported relation"],
    replicate: ["重复编号", "Replicate ID"],
    endpoint: ["每行终点", "Endpoint per row"],
    unit: ["每行单位", "Unit per row"],
    uncertainty: ["SD / SEM 数值", "SD / SEM value"],
    batch: ["每行批次", "Batch per row"],
  };
  const keys = (
    optional
      ? ["relation", "replicate", "endpoint", "unit", "uncertainty", "batch"]
      : ["compound", "value"]
  ) as (keyof Columns)[];
  return (
    <div className="evidence-mapping">
      {keys.map((key) => (
        <label className="field" key={key}>
          {labels[key][zh ? 0 : 1]}
          <select
            aria-label={labels[key][zh ? 0 : 1]}
            value={columns[key]}
            onChange={(e) => onChange({ ...columns, [key]: e.target.value })}
          >
            <option value="">
              {optional
                ? zh
                  ? "未提供，使用当前设置"
                  : "Not reported; use current setting"
                : zh
                  ? "选择表格中的列"
                  : "Choose the actual column"}
            </option>
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
export function ConditionFields({
  value,
  onChange,
  language,
}: {
  value: Conditions;
  onChange(value: Conditions): void;
  language: Language;
}) {
  const zh = language === "zh";
  const label = (key: keyof Conditions, a: string, b: string) => (
    <label className="field" key={key}>
      {zh ? a : b}
      <input
        value={String(value[key] ?? "")}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <div className="evidence-fields">
        {label("target", "靶点或研究表型", "Target or phenotype")}
        {label("assay", "实验名称或编号", "Assay name or ID")}
      </div>
      <details>
        <summary>{zh ? "补充实验条件" : "Additional assay conditions"}</summary>
        <div className="evidence-fields">
          {label("species", "物种", "Species")}
          {label("construct_id", "构建体", "Construct")}
          {label("batch", "批次", "Batch")}
          {label("buffer", "缓冲液/溶剂", "Buffer / solvent")}
          {label("method", "实验方法", "Assay method")}
          {(["temperature_c", "ph"] as const).map((key) => (
            <label className="field" key={key}>
              {key === "ph" ? "pH" : zh ? "温度（°C）" : "Temperature (°C)"}
              <input
                type="number"
                step="any"
                value={value[key] ?? ""}
                min={key === "ph" ? 0 : -20}
                max={key === "ph" ? 14 : 150}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [key]:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      </details>
    </>
  );
}
export const endpoints: Endpoint[] = [
  "IC50",
  "KD",
  "Ki",
  "EC50",
  "DC50",
  "Dmax",
  "inhibition",
  "expression",
  "qualitative",
];
export function endpointUnits(endpoint: Endpoint | "") {
  return ["IC50", "KD", "Ki", "EC50", "DC50"].includes(endpoint)
    ? ["nM", "uM", "pM", "mM", "M"]
    : endpoint === "expression"
      ? ["mg/L", "g/L", "relative"]
      : endpoint === "qualitative"
        ? ["text"]
        : ["%"];
}
