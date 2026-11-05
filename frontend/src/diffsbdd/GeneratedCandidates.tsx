import { CandidateReviewBar } from "../presentation/CandidateReviewBar";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { ReactNode } from "react";
import type { Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { CoreVerificationData } from "./types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import {
  generatedRecordMap,
  qualifiedRecordMap,
  type GeneratedMetrics,
} from "./generated-metrics";
import { generatedColumns } from "./generated-columns";
import { GeneratedMetricsView } from "./GeneratedMetricsView";
import { GeneratedCandidatesBatch } from "./GeneratedCandidatesBatch";
import { GeneratedCandidateDownload } from "./GeneratedCandidateDownload";
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
  sourceSha256,
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
  sourceSha256?: string | null;
  language: Language;
  verification?: CoreVerificationData;
  proteinUrl?: string;
  metrics?: GeneratedMetrics[] | null;
  optimization?: OptimizationData;
  onSelect(value: GeneratedRecord): void;
  children?: ReactNode;
}) {
  const zh = language === "zh";
  const qualified = qualifiedRecordMap(records, verification);
  const mapping = generatedRecordMap(records, metrics, verification);
  const originalNumber = (record: number) =>
    (qualified?.get(record) ?? record) + 1;
  const label = (v: GeneratedRecord) =>
    (generated ? (zh ? "候选 " : "Candidate ") : zh ? "分子 " : "Molecule ") +
    originalNumber(v.record);
  const metric = (v: GeneratedRecord) =>
    mapping?.has(v.record) ? metrics?.[mapping.get(v.record)!] : undefined;
  const active = selected ? metric(selected) : undefined;
  return (
    <StructureWorkbench
      toolbar={
        generated &&
        records.length > 0 && (
          <CandidateReviewBar
            label={zh ? "生成候选预览" : "Generated candidate preview"}
            caption={zh ? "候选" : "Candidate"}
            candidates={records.map(({ record }) => ({
              id: record,
              label:
                (zh ? "预览候选 " : "Preview candidate ") +
                originalNumber(record),
              short: originalNumber(record),
            }))}
            selected={selected?.record}
            language={language}
            metrics={
              active
                ? [
                    { label: "QED", value: active.qed },
                    {
                      label: zh ? "结构组分" : "Components",
                      value: active.fragments ?? "—",
                    },
                    {
                      label: zh
                        ? "口袋近接原子对（< 1.2 Å）"
                        : "Pocket atom pairs < 1.2 Å",
                      value: active.pocket_atom_pairs_under_1_2_angstrom,
                    },
                  ]
                : []
            }
            onSelect={(id) => {
              const candidate = records.find(({ record }) => record === id);
              if (candidate) onSelect(candidate);
            }}
            actions={
              selected &&
              sourceSha256 &&
              (selected.object?.reference.conformer ?? 0) === 0 && (
                <GeneratedCandidateDownload
                  key={JSON.stringify([url, sourceSha256, selected.record])}
                  url={url}
                  sha256={sourceSha256}
                  record={selected.record}
                  number={originalNumber(selected.record)}
                  language={language}
                />
              )
            }
          />
        )
      }
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
                  receptorUrl={generated ? proteinUrl : undefined}
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
            verification: Boolean(qualified),
            metrics: Boolean(mapping),
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
