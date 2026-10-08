import type { Language } from "../types";
import type { EvaluationRow, SequenceEvaluation } from "./types";

function score(value: SequenceEvaluation | null, kind: "mean" | "peptides") {
  if (!value) return "—";
  return kind === "mean"
    ? value.mean_native_residue_probability.toFixed(4)
    : `${value.matched_peptides} / ${value.total_peptides} (${(100 * value.oas_peptide_fraction).toFixed(1)}%)`;
}
export function ReferenceMetrics({
  row,
  language,
}: {
  row: EvaluationRow;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <div className="table-scroll">
      <table className="humanization-metrics">
        <caption>
          {zh
            ? "同一条序列的参考评估"
            : "Reference evaluation of the same sequence"}
        </caption>
        <thead>
          <tr>
            <th>{zh ? "参考指标" : "Reference metric"}</th>
            <th>{zh ? "原始序列" : "Original"}</th>
            {row.proposal && <th>{zh ? "修改建议" : "Proposal"}</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              Sapiens ·{" "}
              {zh ? "平均原生残基概率" : "Mean native residue probability"}
            </th>
            <td
              title={String(
                row.original_evaluation?.mean_native_residue_probability ?? "",
              )}
            >
              {score(row.original_evaluation, "mean")}
            </td>
            {row.proposal && (
              <td
                title={String(
                  row.proposal_evaluation?.mean_native_residue_probability ??
                    "",
                )}
              >
                {score(row.proposal_evaluation, "mean")}
              </td>
            )}
          </tr>
          <tr>
            <th scope="row">
              OAS ·{" "}
              {zh ? "人类参考肽段匹配" : "Human reference peptide matches"}
            </th>
            <td>{score(row.original_evaluation, "peptides")}</td>
            {row.proposal && (
              <td>{score(row.proposal_evaluation, "peptides")}</td>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
