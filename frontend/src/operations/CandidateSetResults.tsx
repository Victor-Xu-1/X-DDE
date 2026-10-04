import type { Language } from "../types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MetricBars } from "../presentation/MetricBars";
import { ResultTree } from "./StructuredResults";
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const numeric = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
export function CandidateSetResults({
  value,
  language,
}: {
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh";
  const rows = [
    {
      id: "reference",
      label: zh ? "参考候选集" : "Reference set",
      data: record(value.legacy),
    },
    {
      id: "current",
      label: zh ? "当前候选集" : "Current set",
      data: record(value.opendde_harness),
    },
  ];
  const metrics = [
    { key: "candidate_count", label: zh ? "候选数量" : "Candidate count" },
    {
      key: "format_compliance",
      label: zh ? "格式通过比例 (0–1)" : "Format pass fraction (0–1)",
    },
    {
      key: "fold_success_rate",
      label: zh ? "折叠成功比例 (0–1)" : "Fold success fraction (0–1)",
    },
    {
      key: "scored_rate",
      label: zh ? "已有评分比例 (0–1)" : "Scored fraction (0–1)",
    },
    {
      key: "unique_sequence_rate",
      label: zh ? "独特序列比例 (0–1)" : "Unique sequence fraction (0–1)",
    },
    {
      key: "best_objective",
      label: zh ? "最优原生目标分数" : "Best native objective",
    },
  ];
  return (
    <section className="candidate-set-results">
      <div className="result-summary-grid">
        <dl>
          <dt>{zh ? "前列候选重合比例" : "Top candidate overlap fraction"}</dt>
          <dd>{numeric(value.top_k_overlap) ?? "—"}</dd>
        </dl>
        <dl>
          <dt>{zh ? "原生目标分数差" : "Native objective difference"}</dt>
          <dd>{numeric(value.objective_delta) ?? "—"}</dd>
        </dl>
      </div>
      <div className="result-master-detail">
        <ResearchTable
          language={language}
          title={zh ? "候选集对照" : "Candidate set comparison"}
          rows={metrics}
          rowId={(m) => m.key}
          compare={false}
          columns={[
            {
              key: "metric",
              label: zh ? "指标" : "Metric",
              value: (m) => m.label,
            },
            ...rows.map((row) => ({
              key: row.id,
              label: row.label,
              value: (m: (typeof metrics)[number]) => numeric(row.data[m.key]),
              numeric: true,
            })),
          ]}
        />
        <MetricBars
          rows={rows}
          language={language}
          title={zh ? "候选集指标对比" : "Candidate set metrics"}
          rowLabel={(r) => r.label}
          metrics={metrics.map((m) => ({
            ...m,
            value: (row: (typeof rows)[number]) => numeric(row.data[m.key]),
          }))}
        />
      </div>
      <p className="field-help">
        {zh
          ? "比例沿用原生分母。未折叠候选的 0 不代表结构质量低；不同目标函数的分数不能直接比较。"
          : "Fractions retain native denominators. Zero for unrun folding does not mean poor structure quality; different objective functions are not directly comparable."}
      </p>
      <details>
        <summary>{zh ? "原生排序记录" : "Native ranking records"}</summary>
        <ResultTree
          value={{
            reference: rows[0].data.ranked_ids,
            current: rows[1].data.ranked_ids,
          }}
          zh={zh}
        />
      </details>
    </section>
  );
}
export function EvolutionResults({
  value,
  language,
}: {
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh",
    lineage = record(value.lineage_analysis),
    trees = record(value.trees),
    mutations = Array.isArray(value.recurrent_mutations)
      ? value.recurrent_mutations.map(record)
      : [];
  const metrics = [
    {
      key: "candidate_count",
      label: zh ? "出现候选数" : "Candidate occurrences",
    },
    {
      key: "independent_parent_count",
      label: zh ? "独立父本数" : "Independent parents",
    },
    {
      key: "improved_count",
      label: zh ? "原生改进计数" : "Native improvement count",
    },
    {
      key: "mean_improvement",
      label: zh ? "平均原生分数变化" : "Mean native score change",
    },
  ];
  return (
    <section className="evolution-results">
      <div className="result-summary-grid">
        {[
          [zh ? "候选数量" : "Candidate count", value.candidate_count],
          [zh ? "谱系数量" : "Lineage count", lineage.lineage_count],
          [
            zh ? "未解析父本" : "Unresolved parents",
            lineage.unresolved_parent_count,
          ],
        ].map(([label, v], i) => (
          <dl key={i}>
            <dt>{String(label)}</dt>
            <dd>{numeric(v) ?? "—"}</dd>
          </dl>
        ))}
      </div>
      {Array.isArray(lineage.root_ids) && lineage.root_ids.length > 0 && (
        <p>
          {zh ? "起始候选：" : "Starting candidates: "}
          {lineage.root_ids.map(String).join(" · ")}
        </p>
      )}
      {mutations.length > 0 && (
        <div className="result-master-detail">
          <ResearchTable
            language={language}
            title={zh ? "重复出现的变异" : "Recurrent mutations"}
            rows={mutations}
            rowId={(r) => String(r.mutation)}
            compare={false}
            columns={[
              {
                key: "mutation",
                label: zh ? "变异" : "Mutation",
                value: (r) => String(r.mutation ?? "—"),
              },
              ...metrics.map((m) => ({
                key: m.key,
                label: m.label,
                value: (r: Record<string, unknown>) => numeric(r[m.key]),
                numeric: true,
              })),
            ]}
          />
          <MetricBars
            rows={mutations}
            language={language}
            title={zh ? "变异出现情况" : "Mutation occurrences"}
            rowLabel={(r) => String(r.mutation ?? "—")}
            metrics={metrics.map((m) => ({
              ...m,
              value: (r: Record<string, unknown>) => numeric(r[m.key]),
            }))}
          />
        </div>
      )}
      {Object.keys(trees).length > 0 ? (
        <ResultTree value={trees} zh={zh} />
      ) : (
        <p className="field-help">
          {zh
            ? "本次没有形成可展示的父子谱系；仍可查看候选数和变异记录。"
            : "No displayable parent-child lineage was formed; candidate counts and mutation records remain available."}
        </p>
      )}
      {Object.keys(record(value.conservation)).length > 0 && (
        <ResultTree value={value.conservation} zh={zh} />
      )}
    </section>
  );
}
