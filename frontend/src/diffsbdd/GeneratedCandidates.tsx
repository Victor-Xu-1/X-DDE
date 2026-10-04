import type { Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { CoreVerificationData } from "./types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MolecularPreview } from "../presentation/MolecularPreview";
export function GeneratedCandidates({
  objects,
  selected,
  language,
  verification,
  onSelect,
}: {
  objects: ScientificObject[];
  selected: ScientificObject | null;
  language: Language;
  verification?: CoreVerificationData;
  onSelect(value: ScientificObject): void;
}) {
  const zh = language === "zh";
  const label = (v: ScientificObject) =>
    (zh ? "候选 " : "Candidate ") +
    ((verification?.candidates.find(
      (c) => c.qualified_record === v.reference.record,
    )?.record ?? v.reference.record) +
      1);
  return (
    <div className="result-master-detail">
      <ResearchTable
        rows={objects}
        rowId={(v) => v.id}
        title={zh ? "生成的候选分子" : "Generated candidate molecules"}
        language={language}
        selected={selected?.id}
        columns={[
          {
            key: "candidate",
            label: zh ? "候选分子" : "Candidate molecule",
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
                aria-pressed={selected?.id === v.id}
                onClick={() => onSelect(v)}
              >
                <MoleculeImage
                  compact
                  language={language}
                  label={label(v)}
                  source={{
                    url: "/api/assets/" + v.reference.asset_id,
                    record: v.reference.record,
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
            value: (v) => v.reference.record + 1,
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
            {selected.reference.conformer === 0 ? (
              <MolecularPreview
                label={label(selected)}
                language={language}
                source={{
                  url: "/api/assets/" + selected.reference.asset_id,
                  record: selected.reference.record,
                }}
                urls={["/api/assets/" + selected.reference.asset_id]}
                records={[selected.reference.record]}
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
