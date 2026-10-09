import type { Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { CoreVerificationData } from "./types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MolecularPreview } from "../presentation/MolecularPreview";
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
  onSelect,
}: {
  records: GeneratedRecord[];
  generated?: boolean;
  url: string;
  selected: GeneratedRecord | null;
  language: Language;
  verification?: CoreVerificationData;
  onSelect(value: GeneratedRecord): void;
}) {
  const zh = language === "zh";
  const label = (v: GeneratedRecord) =>
    (generated ? (zh ? "候选 " : "Candidate ") : zh ? "分子 " : "Molecule ") +
    ((verification?.candidates.find((c) => c.qualified_record === v.record)
      ?.record ?? v.record) +
      1);
  return (
    <div className="result-master-detail">
      <ResearchTable
        rows={records}
        rowId={(v) => String(v.record)}
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
        columns={[
          {
            key: "candidate",
            label: generated
              ? zh
                ? "候选分子"
                : "Candidate molecule"
              : zh
                ? "分子"
                : "Molecule",
            value: (v) => label(v),
            render: (v) => (
              <button
                type="button"
                className="molecule-record"
                aria-label={
                  label(v) +
                  (verification
                    ? zh
                      ? " · 固定区域检查通过"
                      : " · Fixed-region checks passed"
                    : "")
                }
                aria-pressed={selected?.record === v.record}
                onClick={() => onSelect(v)}
              >
                <MoleculeImage
                  compact
                  language={language}
                  label={label(v)}
                  source={{
                    url,
                    record: v.record,
                  }}
                />
                <span>
                  <strong>{label(v)}</strong>
                  {verification && (
                    <small>
                      {zh ? "固定区域检查通过" : "Fixed-region checks passed"}
                    </small>
                  )}
                </span>
              </button>
            ),
          },
          {
            key: "record",
            label: zh ? "原始记录" : "Original record",
            value: (v) => v.record + 1,
            numeric: true,
          },
        ]}
      />
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
                urls={[url]}
                records={[selected.record]}
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
    </div>
  );
}
