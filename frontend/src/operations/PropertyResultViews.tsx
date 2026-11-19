import type { Language } from "../types";
import { MetricScatter, type PlotMetric } from "../presentation/MetricScatter";
import {
  ResearchTable,
  type ResearchColumn,
} from "../presentation/ResearchTable";
import { ResearchTabs } from "../presentation/ResearchTabs";
import "./property-result-views.css";

export function PropertyResultViews<
  T extends { index: number; available: boolean; reason?: string | null },
>({
  rows,
  current,
  columns,
  metrics,
  language,
  name,
  onSelect,
}: {
  rows: readonly T[];
  current: T;
  columns: readonly ResearchColumn<T>[];
  metrics: readonly PlotMetric<T>[];
  language: Language;
  name(row: T): string;
  onSelect(row: T): void;
}) {
  const zh = language === "zh";
  const selected = String(current.index);
  const details = {
    id: "descriptors",
    label: zh ? "当前分子性质" : "Selected descriptors",
    content: current.available ? (
      <div className="property-descriptors">
        <table
          aria-label={
            zh
              ? "当前分子的计算性质"
              : "Calculated properties for the selected molecule"
          }
        >
          <tbody>
            {columns
              .filter((column) => column.numeric)
              .map((column) => {
                const value = column.value(current);
                const finite =
                  typeof value === "number" && Number.isFinite(value);
                return (
                  <tr key={column.key}>
                    <th scope="row">{column.label}</th>
                    <td title={finite ? String(value) : undefined}>
                      {finite ? Number(value.toPrecision(6)) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <p className="field-help">
          {zh
            ? "RDKit 计算描述符。QED 和 SA 不代表实测药效。"
            : "RDKit descriptors. QED and SA do not measure potency."}
        </p>
      </div>
    ) : (
      <p className="field-help" role="status">
        {current.reason ??
          (zh ? "此记录没有可用性质。" : "No descriptors for this record.")}
      </p>
    ),
  };
  const records = {
    id: "records",
    label: zh ? "记录与导出" : "Records & export",
    content: (
      <ResearchTable
        rows={rows}
        columns={columns}
        initialVisibleColumns={["molecule", "mw", "logp"]}
        rowId={(row) => String(row.index)}
        title={zh ? "分子性质 · RDKit 计算" : "Molecular properties · RDKit"}
        language={language}
        selected={selected}
        onSelect={onSelect}
      />
    ),
  };
  const landscape = {
    id: "landscape",
    label: zh ? "分布" : "Landscape",
    content: (
      <MetricScatter
        rows={rows}
        metrics={metrics}
        language={language}
        label={zh ? "性质分布" : "Property landscape"}
        rowId={(row) => String(row.index)}
        rowLabel={name}
        selected={selected}
        onSelect={onSelect}
      />
    ),
  };
  return (
    <ResearchTabs
      label={zh ? "分子性质结果视图" : "Property result views"}
      tabs={
        rows.length > 1 ? [details, records, landscape] : [details, records]
      }
    />
  );
}
