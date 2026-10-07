import { ResearchTable } from "../presentation/ResearchTable";
import type { EvidenceDraft } from "./useEvidenceDraft";
import { ColumnFields } from "./EvidenceFields";
import { EvidenceLinks } from "./EvidenceLinks";
export function EvidencePreviewQuestion({
  draft: d,
}: {
  draft: EvidenceDraft;
}) {
  return (
    <>
      <details>
        <summary>
          {d.zh
            ? "其他数据列（可选）"
            : "Additional reported columns (optional)"}
        </summary>
        <ColumnFields
          columns={d.columns}
          names={d.names}
          language={d.language}
          onChange={d.setColumns}
          optional
        />
        {d.columns.uncertainty && (
          <label className="field">
            {d.zh ? "误差类型" : "Uncertainty type"}
            <select
              value={d.uncertainty}
              onChange={(e) => d.setUncertainty(e.target.value as "sd" | "sem")}
            >
              <option value="sd">SD</option>
              <option value="sem">SEM</option>
            </select>
          </label>
        )}
      </details>
      <button
        type="button"
        className="secondary-button"
        disabled={!d.valid || d.busy}
        onClick={() => void d.inspect()}
      >
        {d.zh ? "检查全部记录" : "Check all observations"}
      </button>
      {d.preview && (
        <>
          <p>
            {d.preview.total} {d.zh ? "条观测" : "observations"} ·{" "}
            {d.preview.linked} {d.zh ? "条已关联材料" : "linked observations"}
          </p>
          <ResearchTable
            rows={d.preview.observations}
            language={d.language}
            title={d.zh ? "实验记录预览" : "Observation preview"}
            rowId={(r) => r.id}
            compare={false}
            columns={[
              {
                key: "compound",
                label: d.zh ? "材料" : "Material",
                value: (r) => r.compound,
              },
              {
                key: "value",
                label: d.zh ? "原始实测" : "Reported measurement",
                value: (r) =>
                  `${r.relation} ${r.reported_value} ${r.reported_unit}`,
              },
              {
                key: "endpoint",
                label: d.zh ? "终点" : "Endpoint",
                value: (r) => r.endpoint,
              },
              {
                key: "batch",
                label: d.zh ? "批次" : "Batch",
                value: (r) => r.conditions.batch || "—",
              },
              {
                key: "replicate",
                label: d.zh ? "重复" : "Replicate",
                value: (r) => r.replicate || "—",
              },
            ]}
          />
          <EvidenceLinks
            rows={d.preview.observations}
            links={d.links}
            onChange={d.setLinks}
            language={d.language}
          />
          {!d.checked && (
            <p role="status">
              {d.zh
                ? "设置已改变，请再次检查全部记录。"
                : "Settings changed. Check all observations again."}
            </p>
          )}
        </>
      )}
    </>
  );
}
export function EvidenceConfirmQuestion({
  draft: d,
}: {
  draft: EvidenceDraft;
}) {
  return (
    <>
      <label className="field">
        {d.zh ? "研究记录名称" : "Research record name"}
        <input value={d.name} onChange={(e) => d.setName(e.target.value)} />
      </label>
      <dl className="review-list">
        <dt>{d.zh ? "实验" : "Assay"}</dt>
        <dd>
          {d.conditions.target} · {d.conditions.assay}
        </dd>
        <dt>{d.zh ? "终点和单位" : "Endpoint and unit"}</dt>
        <dd>
          {d.endpoint} · {d.unit}
        </dd>
        <dt>{d.zh ? "观测记录" : "Observations"}</dt>
        <dd>{d.preview?.total ?? 0}</dd>
        <dt>{d.zh ? "数据来源" : "Reported source"}</dt>
        <dd>{d.citation}</dd>
      </dl>
      <p>
        {d.zh
          ? "保存原始报告、限值和条件；单位换算不改变实测来源。"
          : "Retain reported values, limits and conditions. Unit normalization preserves the experimental source."}
      </p>
    </>
  );
}
