import { useState } from "react";
import type { Language } from "../types";
import { ResearchTable } from "../presentation/ResearchTable";
import { SequenceTrack } from "../presentation/SequenceTrack";
import { MetricScatter } from "../presentation/MetricScatter";
import { Hint } from "../guided/Hint";
export function SequenceScoreResults({
  sequences,
  scores,
  language,
}: {
  sequences: string[];
  scores: unknown[];
  language: Language;
}) {
  const zh = language === "zh",
    rows = scores.map((value, index) => ({
      index,
      sequence: sequences[index],
      score: typeof value === "number" && Number.isFinite(value) ? value : null,
    }));
  const [selected, setSelected] = useState(0),
    current = rows.find((row) => row.index === selected);
  return (
    <section>
      <h3>
        {zh ? "输入序列的模型评分 · ESM2" : "Input sequence scores · ESM2"}
        <Hint label={zh ? "序列评分说明" : "Sequence score help"}>
          {zh
            ? "模型对序列的支持程度，仅比较同一模型与条件；不是亲和力或药效。"
            : "Model support for sequences compared under the same model and conditions, not affinity or potency."}
        </Hint>
      </h3>
      <div className="result-master-detail">
        <ResearchTable
          rows={rows}
          rowId={(row) => String(row.index)}
          selected={String(selected)}
          onSelect={(row) => setSelected(row.index)}
          language={language}
          title={zh ? "输入序列评分" : "Input sequence scores"}
          columns={[
            {
              key: "sequence",
              label: zh ? "输入序列" : "Input sequence",
              value: (row) => (zh ? "序列 " : "Sequence ") + (row.index + 1),
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
        <div className="result-inspector">
          {current?.sequence && (
            <SequenceTrack
              sequence={current.sequence}
              label={(zh ? "序列 " : "Sequence ") + (current.index + 1)}
              language={language}
            />
          )}
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
      </div>
    </section>
  );
}
