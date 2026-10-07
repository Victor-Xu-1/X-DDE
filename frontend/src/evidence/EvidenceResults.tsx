import { useState } from "react";
import type { Language } from "../types";
import { ResearchTable } from "../presentation/ResearchTable";
import { MaterialPreview } from "./MaterialPreview";
import type { EvidenceDocument, Observation } from "./types";
import { EvidencePlot } from "./EvidencePlot";
import "./evidence.css";
export function EvidenceResults({
  value,
  language,
}: {
  value: EvidenceDocument;
  language: Language;
}) {
  const zh = language === "zh",
    groups = [...new Set(value.observations.map((r) => r.comparison_group))];
  const [selectedGroup, setGroup] = useState(groups[0] ?? "");
  const rows = value.observations.filter(
    (r) => r.comparison_group === selectedGroup,
  );
  const [selected, setSelected] = useState<Observation | null>(null);
  const summaries = value.summaries.filter(
    (r) => r.comparison_group === selectedGroup,
  );
  const current =
    selected && selected.comparison_group === selectedGroup
      ? selected
      : (rows[0] ?? null);
  return (
    <section
      className="evidence-results"
      aria-label={zh ? "实验数据结果" : "Experimental evidence results"}
    >
      <div className="section-heading">
        <h2>{value.request.name}</h2>
        <a href={`/api/research/evidence/${value.id}/download`} download>
          {zh ? "下载实测表格" : "Download observations"}
        </a>
      </div>
      <a href={`/api/assets/${value.request.source.asset_id}`} download>
        {zh ? "下载原始实验文件" : "Download original experimental file"}
      </a>
      <div className="evidence-metrics">
        <span>
          <strong>{value.observations.length}</strong>
          {zh ? "条报告观测" : "reported observations"}
        </span>
        <span>
          <strong>{groups.length}</strong>
          {zh ? "组实验条件" : "assay-condition groups"}
        </span>
        <span>
          <strong>
            {value.observations.filter((r) => r.relation !== "=").length}
          </strong>
          {zh ? "条限值或近似值" : "limits or approximations"}
        </span>
      </div>
      <label className="field">
        {zh
          ? "比较范围（同终点与已报告条件）"
          : "Comparison scope (matched endpoint and reported conditions)"}
        <select
          value={selectedGroup}
          onChange={(e) => {
            setGroup(e.target.value);
            setSelected(null);
          }}
        >
          {groups.map((g, i) => {
            const r = value.observations.find((r) => r.comparison_group === g)!;
            return (
              <option key={g} value={g}>
                {i + 1}. {r.endpoint} · {r.normalized_unit} ·{" "}
                {r.conditions.assay}
                {r.conditions.batch ? ` · ${r.conditions.batch}` : ""}
              </option>
            );
          })}
        </select>
      </label>
      <div
        className={
          current?.molecule ? "evidence-visuals" : "evidence-visuals full"
        }
      >
        <EvidencePlot rows={rows} language={language} onSelect={setSelected} />
        {current?.molecule && (
          <MaterialPreview row={current} language={language} />
        )}
      </div>
      <ResearchTable<Observation>
        rows={rows}
        language={language}
        rowId={(r) => r.id}
        title={zh ? "原始实测记录" : "Reported observations"}
        selected={current?.id ?? null}
        onSelect={setSelected}
        exportName="experimental-observations-view.csv"
        columns={[
          {
            key: "compound",
            label: zh ? "化合物/材料" : "Compound/material",
            value: (r) => r.compound,
          },
          {
            key: "endpoint",
            label: zh ? "终点" : "Endpoint",
            value: (r) => r.endpoint,
          },
          {
            key: "reported",
            label: zh ? "原始报告" : "As reported",
            value: (r) =>
              `${r.relation} ${r.reported_value} ${r.reported_unit}`,
          },
          {
            key: "normalized",
            label: zh ? "统一单位数值" : "Normalized value",
            numeric: true,
            value: (r) => r.normalized_value,
            render: (r) =>
              r.normalized_value === null
                ? "—"
                : `${r.relation} ${r.normalized_value.toPrecision(5)} ${r.normalized_unit}`,
          },
          {
            key: "replicate",
            label: zh ? "重复编号" : "Replicate",
            value: (r) => r.replicate || "—",
          },
          {
            key: "uncertainty",
            label: zh ? "报告误差" : "Reported uncertainty",
            value: (r) =>
              r.uncertainty
                ? `${r.uncertainty.kind.toUpperCase()} ${r.uncertainty.value} ${r.uncertainty.unit}`
                : "—",
          },
          {
            key: "review",
            label: zh ? "需复核" : "Review",
            value: (r) =>
              r.issues.filter(
                (issue) => issue !== "replicate_identity_not_reported",
              ).length
                ? zh
                  ? "需检查"
                  : "Review"
                : "—",
          },
        ]}
      />
      <details>
        <summary>
          {zh ? "同条件摘要与来源" : "Condition-matched summary and source"}
        </summary>
        <p>{value.request.citation}</p>
        <p>
          {zh
            ? "限值不作为精确值计算中位数；记录数不等于独立实验重复数。"
            : "Limits are excluded from exact-value medians. Record counts are not independent replicate counts."}
        </p>
        <ResearchTable
          rows={summaries}
          language={language}
          rowId={(r) => r.compound}
          title={zh ? "同条件摘要" : "Matched-condition summaries"}
          columns={[
            {
              key: "compound",
              label: zh ? "材料" : "Material",
              value: (r) => r.compound,
            },
            {
              key: "count",
              label: zh ? "记录数" : "Records",
              numeric: true,
              value: (r) => r.reported_count,
            },
            {
              key: "exact",
              label: zh ? "精确值数" : "Exact records",
              numeric: true,
              value: (r) => r.exact_count,
            },
            {
              key: "median",
              label: zh ? "精确值中位数" : "Median of exact values",
              numeric: true,
              value: (r) => r.median_if_exact,
            },
            {
              key: "bounds",
              label: zh ? "限值冲突" : "Conflicting bounds",
              value: (r) =>
                r.incompatible_reported_bounds
                  ? zh
                    ? "需复核"
                    : "Review"
                  : "—",
            },
          ]}
        />
      </details>
    </section>
  );
}
