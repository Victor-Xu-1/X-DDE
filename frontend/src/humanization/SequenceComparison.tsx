import { useState, type ReactNode } from "react";
import { Hint } from "../guided/Hint";
import { SequenceAlignment } from "./SequenceAlignment";
import { ReferenceMetrics } from "./ReferenceMetrics";
import type { Language } from "../types";
import type { EvaluationRow } from "./types";
import "../presentation/result-inspection.css";

export function SequenceComparison({
  row,
  language,
  controls,
  actions,
}: {
  row: EvaluationRow;
  language: Language;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  const zh = language === "zh",
    [position, setPosition] = useState<number | null>(null);
  const changed = row.numbering.filter(
    (residue) =>
      row.proposal &&
      row.proposal[residue.source_position - 1] !== residue.amino_acid,
  );
  return (
    <div className="result-inspection">
      <div className="result-inspection-list">
        {controls}
        <ReferenceMetrics row={row} language={language} />
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
        {actions}
      </div>
      <div className="result-inspection-detail">
        <SequenceAlignment
          row={row}
          language={language}
          selectedPosition={position}
          onSelect={setPosition}
        />
        <p className="humanization-legend">
          {row.proposal
            ? zh
              ? "下划线：保留的 CDR · 青绿：修改位置"
              : "Underlined: preserved CDRs · Teal: changed positions"
            : zh
              ? "下划线：CDR 区域 · 本次未修改序列"
              : "Underlined: CDR regions · Source sequence unchanged"}
        </p>
        {changed.length > 0 && (
          <div className="table-scroll humanization-changes">
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
                  <tr
                    key={residue.source_position}
                    className={
                      position === residue.source_position ? "is-selected" : ""
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="alignment-select"
                        aria-label={
                          (zh ? "定位 IMGT " : "Locate IMGT ") +
                          residue.number +
                          residue.insertion
                        }
                        aria-pressed={position === residue.source_position}
                        onClick={() => setPosition(residue.source_position)}
                      >
                        {residue.number}
                        {residue.insertion}
                      </button>
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
      </div>
    </div>
  );
}
