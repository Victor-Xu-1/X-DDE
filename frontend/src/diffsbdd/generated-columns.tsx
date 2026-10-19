import type { Language } from "../types";
import type { ResearchColumn } from "../presentation/ResearchTable";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { GeneratedRecord } from "./GeneratedCandidates";
import type { GeneratedMetrics } from "./generated-metrics";
import type { OptimizationData } from "./optimization-model";

export function generatedColumns({
  url,
  language,
  generated,
  selected,
  verification,
  metrics,
  optimization,
  label,
  metric,
  onSelect,
}: {
  url: string;
  language: Language;
  generated: boolean;
  selected: GeneratedRecord | null;
  verification: boolean;
  metrics: boolean;
  optimization?: OptimizationData;
  label(row: GeneratedRecord): string;
  metric(row: GeneratedRecord): GeneratedMetrics | undefined;
  onSelect(row: GeneratedRecord): void;
}): ResearchColumn<GeneratedRecord>[] {
  const zh = language === "zh";
  const optimized = (row: GeneratedRecord) =>
    optimization?.candidates.find(
      (candidate) => candidate.record === row.record,
    );
  const descriptors: ResearchColumn<GeneratedRecord>[] = [
    {
      key: "qed",
      label: "QED",
      numeric: true,
      value: (row) => optimized(row)?.qed ?? metric(row)?.qed ?? null,
    },
    {
      key: "sa",
      label: "SA",
      numeric: true,
      value: (row) => optimized(row)?.sa ?? metric(row)?.sa ?? null,
    },
  ];
  if (optimization?.objective === "sa") descriptors.reverse();
  const fields: [keyof GeneratedMetrics, string, string][] = [
    ["heavy_atoms", "输出重原子数", "Output heavy atoms"],
    ["molecular_weight", "MW", "MW"],
    ["fragments", "输出片段数", "Output components"],
    [
      "pocket_atom_pairs_under_1_2_angstrom",
      "近接原子对 <1.2 Å",
      "Pocket pairs <1.2 Å",
    ],
  ];
  const other = fields.map(([key, chinese, english]) => ({
    key: key === "pocket_atom_pairs_under_1_2_angstrom" ? "steric_pairs" : key,
    label: zh ? chinese : english,
    numeric: true,
    value: (row: GeneratedRecord) => metric(row)?.[key] ?? null,
  }));
  const record: ResearchColumn<GeneratedRecord> = {
    key: "record",
    label: zh ? "原始记录" : "Original record",
    numeric: true,
    value: (row) => row.record + 1,
  };
  return [
    {
      key: "candidate",
      label: generated
        ? zh
          ? "候选分子"
          : "Candidate molecule"
        : zh
          ? "分子"
          : "Molecule",
      value: label,
      render: (row) => (
        <button
          type="button"
          className="molecule-record"
          aria-label={
            label(row) +
            (verification
              ? zh
                ? " · 固定区域检查通过"
                : " · Fixed-region checks passed"
              : "")
          }
          aria-pressed={selected?.record === row.record}
          onClick={() => onSelect(row)}
        >
          <MoleculeImage
            compact
            language={language}
            label={label(row)}
            source={{ url, record: row.record }}
          />
          <span>
            <strong>{label(row)}</strong>
            {verification && (
              <small>
                {zh ? "固定区域检查通过" : "Fixed-region checks passed"}
              </small>
            )}
          </span>
        </button>
      ),
    },
    ...(optimization
      ? [
          ...descriptors,
          {
            key: "objective_delta",
            label: `Δ${optimization.objective.toUpperCase()}`,
            numeric: true,
            value: (row: GeneratedRecord) => {
              const value = optimized(row);
              return value
                ? Number((value.score - optimization.initial).toFixed(4))
                : null;
            },
          },
          {
            key: "round",
            label: zh ? "轮次" : "Round",
            numeric: true,
            value: (row: GeneratedRecord) => optimized(row)?.round ?? null,
          },
          {
            key: "attempt",
            label: zh ? "采样尝试" : "Sampling attempt",
            numeric: true,
            value: (row: GeneratedRecord) => optimized(row)?.attempt ?? null,
          },
          record,
          ...(metrics ? other : []),
        ]
      : [
          record,
          ...(metrics
            ? [...other.slice(0, 2), ...descriptors, ...other.slice(2)]
            : []),
        ]),
  ];
}
