import { useState } from "react";
import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import { Hint } from "../guided/Hint";
import type { Job, Language, Prediction } from "../types";
import { TargetResearchForm } from "./TargetResearchForm";
import type { EvidenceHit, TargetResearchResult } from "./types";
import "./discovery.css";

export function TargetResearchResults({
  job,
  result,
  language,
  onDraft,
  onCreated,
}: {
  job: Job;
  result: TargetResearchResult;
  language: Language;
  onDraft?(request: Prediction): void;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh",
    [next, setNext] = useState<EvidenceHit | null>(null),
    [copied, setCopied] = useState("");
  const association =
    result.entity.associatedTargets ?? result.entity.associatedDiseases;
  const title =
    result.entity.approvedSymbol ?? result.entity.name ?? result.entity.id;
  if (next && onCreated)
    return (
      <section>
        <button type="button" onClick={() => setNext(null)}>
          {zh ? "返回疾病结果" : "Back to disease results"}
        </button>
        <TargetResearchForm
          key={next.id}
          entity="target"
          initialSelection={next}
          language={language}
          onCreated={onCreated}
        />
      </section>
    );
  return (
    <div className="discovery-results">
      <div className="section-heading">
        <h3>{title}</h3>
        <span title={result.retrieved_at}>
          {zh ? "公共数据库证据" : "Public database evidence"}
        </span>
      </div>
      <div
        className="discovery-sources"
        aria-label={zh ? "来源状态" : "Source states"}
      >
        {result.sources.map((s) => (
          <span key={s.source} title={s.reason}>
            {s.source}:{" "}
            {
              {
                ok: zh ? "已获取" : "Retrieved",
                empty: zh ? "未找到" : "Empty",
                ambiguous: zh ? "需核对映射" : "Ambiguous",
                unavailable: zh ? "获取失败" : "Unavailable",
              }[s.status]
            }
          </span>
        ))}
      </div>
      {result.sources
        .filter((s) => s.status === "unavailable")
        .map((s) => (
          <p key={s.source} role="alert">
            {s.source}: {s.reason}
          </p>
        ))}
      {association && (
        <>
          <h4>
            {result.request.entity === "disease"
              ? zh
                ? "相关靶点"
                : "Associated targets"
              : zh
                ? "疾病关联"
                : "Disease associations"}
          </h4>
          <p className="field-help">
            {zh
              ? `展示 ${association.rows.length} / ${association.count} 条关联，未展示部分未被判为不相关。`
              : `Showing ${association.rows.length} / ${association.count} associations; undisplayed records are not ruled out.`}
          </p>
          <Hint
            label={
              zh ? "关联分数是什么意思？" : "What does association score mean?"
            }
          >
            {zh
              ? "Open Targets 汇集证据的关联评分，不是结合亲和力、疗效或靶点因果验证。"
              : "Open Targets evidence aggregation score; not affinity, efficacy or causal target validation."}
          </Hint>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{zh ? "对象" : "Entity"}</th>
                  <th>{zh ? "关联分数" : "Association score"}</th>
                  <th>{zh ? "下一步" : "Next"}</th>
                </tr>
              </thead>
              <tbody>
                {association.rows.map((row) => {
                  const id = row.target?.id ?? row.disease!.id;
                  return (
                    <tr key={id}>
                      <td>{row.target?.approvedSymbol ?? row.disease?.name}</td>
                      <td>{row.score.toFixed(3)}</td>
                      <td>
                        {row.target && onCreated ? (
                          <button
                            type="button"
                            onClick={() =>
                              setNext({
                                id,
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
                            href={`https://platform.opentargets.org/${row.target ? "target" : "disease"}/${encodeURIComponent(id)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {zh ? "查看来源" : "View source"}
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!association.rows.length && (
            <p>{zh ? "当前查询未返回关联。" : "No associations returned."}</p>
          )}
        </>
      )}
      {result.entity.tractability && (
        <details>
          <summary>
            {zh
              ? "不同药物形式的干预线索"
              : "Modality-specific tractability evidence"}
          </summary>
          <ul>
            {result.entity.tractability
              .filter((x) => x.value)
              .map((x) => (
                <li key={x.modality + x.label}>
                  {(
                    {
                      SM: zh ? "小分子" : "Small molecules",
                      AB: zh ? "抗体" : "Antibodies",
                      PR: zh ? "蛋白降解" : "Protein degradation",
                      OC: zh ? "寡核苷酸" : "Oligonucleotides",
                    } as Record<string, string>
                  )[x.modality] ?? x.modality}{" "}
                  · {x.label}
                </li>
              ))}
          </ul>
          <p className="field-help">
            {zh
              ? "未列出不等于不可干预；这些是来源数据库的证据标签。"
              : "Unlisted items do not establish intractability; these are source evidence labels."}
          </p>
        </details>
      )}
      {result.materials.map((m) => (
        <section key={m.accession}>
          <h4>
            {zh ? "可复用研究材料" : "Reusable materials"} · {m.accession}
          </h4>
          <a href={artifactUrl(job.id, m.artifact)} download>
            {zh ? "下载靶点序列" : "Download target sequence"}
          </a>{" "}
          {onDraft && (
            <button
              type="button"
              onClick={() =>
                onDraft({
                  name: title.slice(0, 80),
                  components: [
                    {
                      kind: "protein",
                      value: m.sequence,
                      count: 1,
                      source_sequence: m.reference?.asset_id,
                    },
                  ],
                  scientific_inputs: m.reference ? [m.reference] : [],
                  parameters: { ...defaults },
                })
              }
            >
              {zh
                ? "用这条序列预测结构"
                : "Predict structure from this sequence"}
            </button>
          )}
          <p className="field-help">
            {zh
              ? "这是来源数据库的规范序列；异构体、突变体及实验构建体需另外核对。"
              : "Canonical source sequence; check isoforms, mutants and experimental constructs separately."}
          </p>
          <details>
            <summary>
              {zh
                ? `实验结构索引 ${m.structures.length} / ${m.structure_total}`
                : `Experimental structure references ${m.structures.length} / ${m.structure_total}`}
            </summary>
            <ul>
              {m.structures.map((s) => (
                <li key={s.id}>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.rcsb.org/structure/${encodeURIComponent(s.id)}`}
                  >
                    {s.id}
                  </a>{" "}
                  · {s.properties.map((p) => p.value).join(" · ")}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ))}
      {result.activities && (
        <details>
          <summary>
            {zh
              ? `已有实测活性 ${result.activities.rows.length} / ${result.activities.total ?? "未知"}`
              : `Reported activities ${result.activities.rows.length} / ${result.activities.total ?? "unknown"}`}
          </summary>
          <p className="field-help">
            {zh
              ? "保留端点、关系符、单位和实验说明；不把 IC50、Ki、Kd、EC50 混为同一个分数。当前为有限记录样本，不代表最佳或全部化合物。"
              : "Endpoints, relations, units and assay descriptions stay separate. This bounded sample is neither an exhaustive nor a best-compound ranking."}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    zh ? "化合物" : "Compound",
                    zh ? "实测端点" : "Endpoint",
                    zh ? "实验" : "Assay",
                    zh ? "复用" : "Reuse",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.activities.rows.map((a) => (
                  <tr key={a.activity_id}>
                    <td>
                      <a
                        href={`https://www.ebi.ac.uk/chembl/explore/compound/${encodeURIComponent(a.molecule_chembl_id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.molecule_chembl_id}
                      </a>
                      {a.data_validity_comment && (
                        <p>{a.data_validity_comment}</p>
                      )}
                    </td>
                    <td>
                      {a.standard_type} {a.standard_relation}{" "}
                      {a.standard_value ?? "—"} {a.standard_units}
                    </td>
                    <td title={a.assay_description}>{a.assay_chembl_id}</td>
                    <td>
                      {a.canonical_smiles && (
                        <button
                          type="button"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(a.canonical_smiles!)
                              .then(() => setCopied(String(a.activity_id)))
                              .catch(() =>
                                setCopied(
                                  zh
                                    ? "复制失败，请从下载结果读取结构。"
                                    : "Copy failed; read the downloaded result.",
                                ),
                              )
                          }
                        >
                          {zh ? "复制分子结构" : "Copy SMILES"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {copied && (
            <p role="status">
              {copied.includes(" ") || copied.includes("失败")
                ? copied
                : zh
                  ? "分子结构已复制，可用于性质、编辑或对接准备。"
                  : "Structure copied for properties, editing or docking preparation."}
            </p>
          )}
        </details>
      )}
      <a href={artifactUrl(job.id, "result.json")} download>
        {zh ? "下载完整证据与来源记录" : "Download evidence and provenance"}
      </a>
    </div>
  );
}
