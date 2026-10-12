import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Language } from "../types";
import type { EvaluationRow } from "./types";

const aminoAcids = "ACDEFGHIKLMNPQRSTVWY".split("");

export function ReferenceMetricsDetails({
  row,
  language,
  selectedPosition,
  onSelect,
}: {
  row: EvaluationRow;
  language: Language;
  selectedPosition: number | null;
  onSelect(position: number): void;
}) {
  const zh = language === "zh",
    scores = row.original_scores;
  if (!scores || scores.length !== row.source_sequence.length) return null;
  const residues = row.numbering.map((residue) => ({
    ...residue,
    probabilities: scores[residue.source_position - 1],
    nativeProbability: scores[residue.source_position - 1][residue.amino_acid],
  }));
  const proposed = row.proposal && row.proposal_scores;
  return (
    <section aria-label={zh ? "逐位参考评估" : "Residue reference evaluation"}>
      <InteractivePlot
        language={language}
        title={
          zh
            ? "原始残基的模型概率 · Sapiens"
            : "Native residue probabilities · Sapiens"
        }
        data={[
          {
            type: "scatter",
            mode: "lines",
            name: zh ? "原始序列" : "Original sequence",
            x: residues.map((r) => r.source_position),
            y: residues.map((r) => r.nativeProbability),
            line: { color: "#6554cf", width: 2 },
          },
          ...(proposed
            ? [
                {
                  type: "scatter" as const,
                  mode: "lines" as const,
                  name: zh ? "建议序列" : "Proposed sequence",
                  x: residues.map((r) => r.source_position),
                  y: residues.map(
                    (r) =>
                      row.proposal_scores![r.source_position - 1][
                        row.proposal![r.source_position - 1]
                      ],
                  ),
                  line: { color: "#168c86", width: 2 },
                },
              ]
            : []),
        ]}
        layout={{
          xaxis: {
            title: { text: zh ? "原始序列位置" : "Source sequence position" },
          },
          yaxis: {
            title: { text: zh ? "原生模型概率" : "Native model probability" },
            range: [0, 1],
          },
        }}
        onPoint={(point) => {
          if (typeof point.x === "number" && Number.isInteger(point.x))
            onSelect(point.x);
        }}
      />
      <details>
        <summary>
          {zh ? "逐位概率与导出" : "Residue probabilities and export"}
        </summary>
        <ResearchTable
          language={language}
          title={zh ? "原始残基概率" : "Original residue probabilities"}
          rows={residues}
          rowId={(r) => String(r.source_position)}
          selected={selectedPosition === null ? null : String(selectedPosition)}
          onSelect={(r) => onSelect(r.source_position)}
          compare={false}
          exportName="sapiens-original-residue-probabilities.csv"
          initialVisibleColumns={[
            "position",
            "imgt",
            "amino_acid",
            "region",
            "native",
          ]}
          columns={[
            {
              key: "position",
              label: zh ? "原始位置" : "Source position",
              numeric: true,
              value: (r) => r.source_position,
            },
            {
              key: "imgt",
              label: "IMGT",
              value: (r) => String(r.number) + r.insertion,
            },
            {
              key: "amino_acid",
              label: zh ? "氨基酸" : "Amino acid",
              value: (r) => r.amino_acid,
            },
            {
              key: "region",
              label: zh ? "区域" : "Region",
              value: (r) => r.region,
            },
            {
              key: "native",
              label: zh ? "原始残基概率" : "Native residue probability",
              numeric: true,
              value: (r) => r.nativeProbability,
              render: (r) => (
                <span title={String(r.nativeProbability)}>
                  {r.nativeProbability.toFixed(4)}
                </span>
              ),
            },
            ...aminoAcids.map((aa) => ({
              key: "p_" + aa,
              label: "P(" + aa + ")",
              numeric: true,
              value: (r: (typeof residues)[number]) => r.probabilities[aa],
            })),
          ]}
        />
      </details>
      {row.original_evaluation && (
        <details>
          <summary>
            {zh ? "OAS 肽段匹配与导出" : "OAS peptide matches and export"}
          </summary>
          <ResearchTable
            language={language}
            title={
              zh ? "原始序列的 OAS 肽段" : "Original-sequence OAS peptides"
            }
            rows={row.original_evaluation.peptides}
            rowId={(r) => String(r.source_position)}
            compare={false}
            exportName="oas-original-peptide-matches.csv"
            onSelect={(r) => onSelect(r.source_position)}
            columns={[
              {
                key: "position",
                label: zh ? "起始位置" : "Start position",
                numeric: true,
                value: (r) => r.source_position,
              },
              {
                key: "sequence",
                label: zh ? "九肽" : "9-mer",
                value: (r) => r.sequence,
              },
              {
                key: "matched",
                label: zh ? "参考中存在" : "Found in reference",
                value: (r) => r.matched,
                render: (r) =>
                  r.matched ? (zh ? "是" : "Yes") : zh ? "否" : "No",
              },
            ]}
          />
        </details>
      )}
    </section>
  );
}
