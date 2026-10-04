import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import { ResearchTable } from "../presentation/ResearchTable";
import type { Association, EvidenceHit } from "./types";
export function AssociationResults({
  value,
  language,
  onTarget,
}: {
  value: { rows: Association[]; count: number };
  language: Language;
  onTarget?(hit: EvidenceHit): void;
}) {
  const zh = language === "zh";
  return (
    <section>
      <p className="field-help">
        {zh
          ? "展示 " +
            value.rows.length +
            " / " +
            value.count +
            " 条来源关联；未展示记录不代表不相关。"
          : "Showing " +
            value.rows.length +
            " / " +
            value.count +
            " source associations; omitted records are not ruled out."}
        <Hint
          label={
            zh ? "关联分数是什么意思？" : "What does association score mean?"
          }
        >
          {zh
            ? "Open Targets 的证据汇总评分，不是结合亲和力、疗效或因果验证。"
            : "Open Targets evidence aggregation score, not affinity, efficacy or causal validation."}
        </Hint>
      </p>
      <ResearchTable
        rows={value.rows}
        language={language}
        title={zh ? "关联证据" : "Association evidence"}
        rowId={(row) => row.target?.id ?? row.disease!.id}
        initialSort={{ key: "score", direction: "descending" }}
        columns={[
          {
            key: "entity",
            label: zh ? "研究对象" : "Entity",
            value: (row) => row.target?.approvedSymbol ?? row.disease?.name,
            render: (row) => (
              <span>
                <strong>
                  {row.target?.approvedSymbol ?? row.disease?.name}
                </strong>
                {row.target?.approvedName && (
                  <small className="evidence-description">
                    {row.target.approvedName}
                  </small>
                )}
              </span>
            ),
          },
          {
            key: "score",
            label: zh ? "关联分数" : "Association score",
            value: (row) => row.score,
            numeric: true,
            render: (row) => (
              <span className="score-gauge">
                {row.score.toFixed(3)}
                <i aria-hidden="true">
                  <span
                    style={{
                      width: Math.max(0, Math.min(1, row.score)) * 100 + "%",
                    }}
                  />
                </i>
              </span>
            ),
          },
          {
            key: "next",
            label: zh ? "下一步" : "Next step",
            sortable: false,
            value: (row) => row.target?.id ?? row.disease!.id,
            render: (row) =>
              row.target && onTarget ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    onTarget({
                      id: row.target!.id,
                      name: row.target!.approvedSymbol,
                      description: row.target!.approvedName,
                      entity: "target",
                    })
                  }
                >
                  {zh ? "研究这个靶点" : "Research this target"}
                </button>
              ) : (
                <a
                  href={
                    "https://platform.opentargets.org/" +
                    (row.target ? "target/" : "disease/") +
                    encodeURIComponent(row.target?.id ?? row.disease!.id)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {zh ? "查看来源" : "View source"}
                </a>
              ),
          },
        ]}
      />
    </section>
  );
}
