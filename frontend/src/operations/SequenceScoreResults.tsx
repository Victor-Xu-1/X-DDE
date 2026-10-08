import { useState } from "react";
import type { Language } from "../types";
import { ResearchTable } from "../presentation/ResearchTable";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { MetricScatter } from "../presentation/MetricScatter";
import { Hint } from "../guided/Hint";
import "../presentation/result-inspection.css";
import "./sequence-scores.css";
interface SequenceScoreProps {
  sequences: string[];
  scores: unknown[];
  language: Language;
}
export function SequenceScoreResults({
  sequences,
  scores,
  language,
}: SequenceScoreProps) {
  return (
    <SequenceScoreInspection
      key={JSON.stringify([sequences, scores])}
      sequences={sequences}
      scores={scores}
      language={language}
    />
  );
}
function SequenceScoreInspection({
  sequences,
  scores,
  language,
}: SequenceScoreProps) {
  const zh = language === "zh",
    rows = Array.from(
      { length: Math.max(sequences.length, scores.length) },
      (_, index) => ({
        index,
        sequence: sequences[index],
        score:
          typeof scores[index] === "number" && Number.isFinite(scores[index])
            ? (scores[index] as number)
            : null,
      }),
    );
  const [selected, setSelected] = useState(0),
    current = rows.find((row) => row.index === selected);
  return (
    <section
      className="sequence-score-results"
      aria-label={zh ? "序列评分结果" : "Sequence score results"}
    >
      <div className="result-inspection-heading">
        <h3>
          {zh ? "输入序列的模型评分 · ESM2" : "Input sequence scores · ESM2"}
          <Hint label={zh ? "序列评分说明" : "Sequence score help"}>
            {zh
              ? "模型对序列的支持程度，仅比较同一模型与条件；不是亲和力或药效。"
              : "Model support for sequences compared under the same model and conditions, not affinity or potency."}
          </Hint>
        </h3>
        <span className="result-inspection-count">
          {rows.length} {zh ? "条序列" : "sequences"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p role="status">
          {zh
            ? "本次结果未提供序列评分。"
            : "This result contains no sequence scores."}
        </p>
      ) : (
        <div className="result-inspection">
          <div className="result-inspection-list">
            <ResearchTable
              rows={rows}
              rowId={(row) => String(row.index)}
              selected={String(selected)}
              onSelect={(row) => setSelected(row.index)}
              language={language}
              title={zh ? "输入序列评分" : "Input sequence scores"}
              compare={false}
              exportName="sequence-scores.csv"
              columns={[
                {
                  key: "sequence",
                  label: zh ? "输入序列" : "Input sequence",
                  value: (row) =>
                    (zh ? "序列 " : "Sequence ") + (row.index + 1),
                },
                {
                  key: "length",
                  label: zh ? "长度 (aa)" : "Length (aa)",
                  value: (row) => row.sequence?.length,
                  numeric: true,
                },
                {
                  key: "score",
                  label: zh ? "模型分数" : "Model score",
                  value: (row) => row.score,
                  numeric: true,
                  render: (row) => (
                    <span title={String(row.score)}>
                      {row.score?.toFixed(4) ?? "—"}
                    </span>
                  ),
                },
              ]}
            />
            <MetricScatter
              rows={rows}
              language={language}
              label={zh ? "序列评分分布" : "Sequence score landscape"}
              selected={String(selected)}
              rowId={(row) => String(row.index)}
              rowLabel={(row) => (zh ? "序列 " : "Sequence ") + (row.index + 1)}
              onSelect={(row) => setSelected(row.index)}
              metrics={[
                {
                  key: "length",
                  label: zh ? "长度 (aa)" : "Length (aa)",
                  value: (row) => row.sequence?.length,
                },
                {
                  key: "score",
                  label: zh ? "ESM2 模型分数" : "ESM2 model score",
                  value: (row) => row.score,
                },
              ]}
            />
          </div>
          <div className="result-inspection-detail">
            {current?.sequence ? (
              <SequenceTrack
                key={current.index}
                sequence={current.sequence}
                label={(zh ? "序列 " : "Sequence ") + (current.index + 1)}
                language={language}
              />
            ) : (
              <div className="result-inspection-empty" role="status">
                <p>
                  {zh
                    ? "该条评分没有对应的输入序列，无法显示残基。"
                    : "No input sequence accompanies this score; residues cannot be displayed."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
