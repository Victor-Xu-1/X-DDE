import { Hint } from "../guided/Hint";
import { SequenceAlignment } from "./SequenceAlignment";
import type { Language } from "../types";
import type { EvaluationRow, SequenceEvaluation } from "./types";

function score(value: SequenceEvaluation | null, kind: "mean" | "peptides") {
  if (!value) return "—";
  return kind === "mean"
    ? value.mean_native_residue_probability.toFixed(4)
    : `${value.matched_peptides} / ${value.total_peptides} (${(100 * value.oas_peptide_fraction).toFixed(1)}%)`;
}

export function SequenceComparison({
  row,
  language,
}: {
  row: EvaluationRow;
  language: Language;
}) {
  const zh = language === "zh";
  const changed = row.numbering.filter(
    (residue) =>
      row.proposal &&
      row.proposal[residue.source_position - 1] !== residue.amino_acid,
  );
  return (
    <>
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
              <th>{zh ? "修改建议" : "Proposal"}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>
                Sapiens ·{" "}
                {zh ? "平均原生残基概率" : "Mean native residue probability"}
              </th>
              <td>{score(row.original_evaluation, "mean")}</td>
              <td>{score(row.proposal_evaluation, "mean")}</td>
            </tr>
            <tr>
              <th>
                OAS ·{" "}
                {zh ? "人类参考肽段匹配" : "Human reference peptide matches"}
              </th>
              <td>{score(row.original_evaluation, "peptides")}</td>
              <td>{score(row.proposal_evaluation, "peptides")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <SequenceAlignment row={row} language={language} />
      <p className="humanization-legend">
        {zh
          ? "下划线：保留的 CDR · 绿色：修改位置"
          : "Underlined: preserved CDRs · Green: changed positions"}
      </p>
      {changed.length > 0 && (
        <div className="table-scroll">
          <table>
            <caption>
              {zh
                ? `最终修改 ${changed.length} 处`
                : `${changed.length} final changed positions`}
            </caption>
            <thead>
              <tr>
                <th>IMGT</th>
                <th>{zh ? "原始位置" : "Source position"}</th>
                <th>{zh ? "原始" : "Original"}</th>
                <th>{zh ? "建议" : "Proposed"}</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((residue) => (
                <tr key={residue.source_position}>
                  <td>
                    {residue.number}
                    {residue.insertion}
                  </td>
                  <td>{residue.source_position}</td>
                  <td>{residue.amino_acid}</td>
                  <td>{row.proposal![residue.source_position - 1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Hint
        label={
          zh
            ? "如何读这些参考指标？"
            : "How should these reference metrics be read?"
        }
      >
        {zh
          ? "模型概率保留原生定义，不归一化为‘人源化百分比’；OAS 是固定人类参考中 9 个残基肽段的精确匹配比例。两个指标分开显示，不合成为临床评分。"
          : "Native probabilities are not renormalized into a humanization percentage. OAS is the exact fraction of 9-residue peptide windows found in the fixed human reference. These separate metrics are not combined into a clinical score."}
      </Hint>
    </>
  );
}
