import type { Language } from "../types";
import type { ResearchColumn } from "./ResearchTable";
import "./table-columns.css";

export function TableColumns<T>({
  columns,
  visible,
  language,
  onToggle,
  onReset,
  onShowAll,
}: {
  columns: readonly ResearchColumn<T>[];
  visible: readonly string[];
  language: Language;
  onToggle(key: string): void;
  onReset(): void;
  onShowAll(): void;
}) {
  const zh = language === "zh";
  if (columns.length <= 3) return null;
  return (
    <details className="table-columns">
      <summary>{zh ? "显示指标" : "Columns"}</summary>
      <fieldset className="table-column-options">
        <legend className="sr-only">
          {zh ? "选择表格显示的指标" : "Choose visible table metrics"}
        </legend>
        <div className="table-column-presets">
          <button type="button" onClick={onReset}>
            {zh ? "常用指标" : "Core metrics"}
          </button>
          <button type="button" onClick={onShowAll}>
            {zh ? "全部指标" : "All metrics"}
          </button>
        </div>
        <div className="table-column-choices">
          {columns.map((column, index) => (
            <label key={column.key} title={column.exportLabel}>
              <input
                type="checkbox"
                checked={visible.includes(column.key)}
                disabled={index === 0}
                onChange={() => onToggle(column.key)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
        <p>
          {zh
            ? "下载保留全部原始指标。"
            : "Downloads retain all original metrics."}
        </p>
      </fieldset>
    </details>
  );
}
