import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { CoreVerificationData } from "./types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { MolecularPreview } from "../presentation/MolecularPreview";
import type { GeneratedMetrics } from "./generated-metrics";
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
  onSelect,
}: {
  records: GeneratedRecord[];
  generated?: boolean;
  url: string;
  selected: GeneratedRecord | null;
  language: Language;
  verification?: CoreVerificationData;
  proteinUrl?: string;
  metrics?: GeneratedMetrics[] | null;
  onSelect(value: GeneratedRecord): void;
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
              {active?.fragments != null && active.fragments > 1 && (
                <p
                  className="notice"
                  role="status"
                  aria-label={zh ? "分子连接状态" : "Molecular connectivity"}
                >
                  {zh
                    ? `包含 ${active.fragments} 个未连接的结构片段，尚未形成一个完整分子。固定区域检查通过不代表片段连接成功；请检查连接关系后再用于后续设计。`
                    : `Contains ${active.fragments} disconnected components, not one complete molecule. Passing fixed-region checks does not establish successful fragment linking; inspect connectivity before downstream design.`}
                </p>
              )}

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
          ...(metrics
            ? [
                {
                  key: "heavy_atoms",
                  label: zh ? "输出重原子数" : "Output heavy atoms",
                  numeric: true,
                  value: (v: GeneratedRecord) => metric(v)?.heavy_atoms ?? null,
                },
                {
                  key: "molecular_weight",
                  label: "MW",
                  numeric: true,
                  value: (v: GeneratedRecord) =>
                    metric(v)?.molecular_weight ?? null,
                },
                {
                  key: "qed",
                  label: "QED",
                  numeric: true,
                  value: (v: GeneratedRecord) => metric(v)?.qed ?? null,
                },
                {
                  key: "sa",
                  label: "SA",
                  numeric: true,
                  value: (v: GeneratedRecord) => metric(v)?.sa ?? null,
                },
                {
                  key: "fragments",
                  label: zh ? "输出片段数" : "Output components",
                  numeric: true,
                  value: (v: GeneratedRecord) => metric(v)?.fragments ?? null,
                },
                {
                  key: "steric_pairs",
                  label: zh ? "近接原子对 <1.2 Å" : "Pocket pairs <1.2 Å",
                  numeric: true,
                  value: (v: GeneratedRecord) =>
                    metric(v)?.pocket_atom_pairs_under_1_2_angstrom ?? null,
                },
              ]
            : []),
        ]}
      />
      {active && (
        <>
          <small className="field-help">
            {zh ? "输出分子的指标" : "Output molecule metrics"}
          </small>
          <dl className="native-result-metrics">
            <div>
              <dt>LogP</dt>
              <dd>{active.logp}</dd>
            </div>
            <div>
              <dt>TPSA · Å²</dt>
              <dd>{active.tpsa}</dd>
            </div>
            <div>
              <dt>HBD / HBA</dt>
              <dd>
                {active.hbd} / {active.hba}
              </dd>
            </div>
            <div>
              <dt>
                {zh
                  ? "最近条件口袋距离"
                  : "Nearest conditioning-pocket distance"}
              </dt>
              <dd>{active.minimum_pocket_distance_angstrom} Å</dd>
            </div>
          </dl>
          <p
            className={
              active.pocket_atom_pairs_under_1_2_angstrom > 0
                ? "notice"
                : "field-help"
            }
          >
            {active.pocket_atom_pairs_under_1_2_angstrom > 0
              ? zh
                ? "存在可能的空间碰撞：请先检查并优化姿势，再进行后续研究。"
                : "Potential steric clashes: inspect and refine the pose before downstream research."
              : zh
                ? "近接指标仅检查作为生成条件的口袋原子，不覆盖其余蛋白；请继续进行完整受体的姿势质控。"
                : "Proximity metrics cover conditioning-pocket atoms only, not the rest of the protein. Continue with full-receptor pose-quality checks."}
          </p>
        </>
      )}
    </StructureWorkbench>
  );
}
