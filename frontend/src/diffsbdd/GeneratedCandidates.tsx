import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { ReactNode } from "react";
import type { Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { CoreVerificationData } from "./types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import type { GeneratedMetrics } from "./generated-metrics";
import { generatedColumns } from "./generated-columns";
import { GeneratedMetricsView } from "./GeneratedMetricsView";
import { GeneratedCandidatesBatch } from "./GeneratedCandidatesBatch";
import { OptimizationFigures } from "./OptimizationFigures";
import type { OptimizationData } from "./optimization-model";
export interface GeneratedRecord {
  record: number;
  object?: ScientificObject;
}
export function GeneratedCandidates({
  records,
  generated = true,
  url,
  selected,
  language,
  verification,
  proteinUrl,
  metrics,
  optimization,
  onSelect,
  children,
}: {
  records: GeneratedRecord[];
  generated?: boolean;
  url: string;
  selected: GeneratedRecord | null;
  language: Language;
  verification?: CoreVerificationData;
  proteinUrl?: string;
  metrics?: GeneratedMetrics[] | null;
  optimization?: OptimizationData;
  onSelect(value: GeneratedRecord): void;
  children?: ReactNode;
}) {
  const zh = language === "zh";
  const label = (v: GeneratedRecord) =>
    (generated ? (zh ? "候选 " : "Candidate ") : zh ? "分子 " : "Molecule ") +
    ((verification?.candidates.find((c) => c.qualified_record === v.record)
      ?.record ?? v.record) +
      1);
  const metric = (v: GeneratedRecord) =>
    metrics?.[
      verification?.candidates.find((c) => c.qualified_record === v.record)
        ?.record ?? v.record
    ];
  const active = selected ? metric(selected) : undefined;
  return (
    <StructureWorkbench
      preview={
        <div className="result-inspector">
          {selected && (
            <>
              <header>
                <h3>{label(selected)}</h3>
              </header>
              {(selected.object?.reference.conformer ?? 0) === 0 ? (
                <MolecularPreview
                  label={label(selected)}
                  language={language}
                  source={{
                    url,
                    record: selected.record,
                  }}
                  urls={proteinUrl ? [proteinUrl, url] : [url]}
                  records={
                    proteinUrl ? [0, selected.record] : [selected.record]
                  }
                  focusModel={proteinUrl ? 1 : undefined}
                  defaultView="3d"
                />
              ) : (
                <p className="field-help">
                  {zh
                    ? "当前查看器未支持这份记录中的独立构象索引，请查看原始文件。"
                    : "This viewer does not support the independent conformer index in this record; inspect the original file."}
                </p>
              )}
            </>
          )}
        </div>
      }
    >
      {generated && !optimization && records.length > 0 && (
        <GeneratedCandidatesBatch
          records={records}
          metrics={metrics}
          verification={verification}
          language={language}
        />
      )}
      {active && <GeneratedMetricsView active={active} language={language} />}
      {selected && generated && !active && (
        <p className="field-help" role="status">
          {zh
            ? "此记录的逐结构检查信息未提供，不能据此认定构象已通过质控。"
            : "Per-structure checks are unavailable for this record; pose-quality acceptance has not been established."}
        </p>
      )}
      <div
        className={optimization ? "optimization-candidate-table" : undefined}
      >
        <ResearchTable
          key={url}
          rows={records}
          rowId={(value) => String(value.record)}
          title={
            generated
              ? zh
                ? "生成的候选分子"
                : "Generated candidate molecules"
              : zh
                ? "结果中的分子"
                : "Molecules in this result"
          }
          language={language}
          selected={selected ? String(selected.record) : null}
          onSelect={onSelect}
          initialVisibleColumns={
            optimization
              ? ["candidate", "qed", "sa", "objective_delta"]
              : undefined
          }
          initialSort={
            optimization
              ? {
                  key: optimization.objective,
                  direction:
                    optimization.objective === "qed"
                      ? "descending"
                      : "ascending",
                }
              : undefined
          }
          columns={generatedColumns({
            url,
            language,
            generated,
            selected,
            verification: Boolean(verification),
            metrics: Boolean(metrics),
            optimization,
            label,
            metric,
            onSelect,
          })}
        />
      </div>
      {optimization && (
        <OptimizationFigures
          data={optimization}
          language={language}
          selected={selected?.record ?? null}
          onSelect={(record) => {
            const row = records.find((value) => value.record === record);
            if (row) onSelect(row);
          }}
        />
      )}
      {children}
    </StructureWorkbench>
  );
}
