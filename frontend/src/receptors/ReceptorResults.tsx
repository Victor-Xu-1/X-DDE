import { useEffect, useState } from "react";
import { artifactUrl, request } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { PocketForm } from "../pockets/PocketForm";
import type { Job, Language } from "../types";
import type { ReceptorResult, ReceptorSet } from "./types";
import "./receptors.css";

export function ReceptorResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: ReceptorResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [sets, setSets] = useState<ReceptorSet[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [next, setNext] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setSets([]);
    setError("");
    setSelected(null);
    setNext(false);
    void request<ReceptorSet[]>(
      `/research/receptor-ensembles?source_job=${encodeURIComponent(job.id)}`,
      { signal: c.signal },
    )
      .then((v) => {
        if (!c.signal.aborted) setSets(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [job.id]);
  const member = data.members.find((m) => m.index === selected),
    reference = data.members[data.options.reference_index],
    saved = sets
      .flatMap((s) => s.members)
      .find((m) => m.evidence.index === selected)?.reference;
  const urls = member?.artifact
    ? [
        ...new Set(
          [reference.artifact, member.artifact].filter((v): v is string => !!v),
        ),
      ].map((v) => artifactUrl(job.id, v))
    : [];
  return (
    <section
      className="receptor-results"
      aria-label={zh ? "受体构象集合结果" : "Receptor ensemble results"}
      aria-busy={loading}
    >
      <p>
        {zh ? "通过对齐的成员" : "Aligned members"}: {data.qualified_count} /{" "}
        {data.members.length}
      </p>
      <p className="field-help">
        {zh
          ? "这是已有结构的刚体对齐。骨架与坐标检查不代表完整原子参数化；B 因子不自动解释为预测置信度。"
          : "Rigid alignment of supplied structures. Coordinate/backbone checks do not imply full atom parameterization; B-factors are not automatically prediction confidence."}
      </p>
      {data.qualified_count < 2 && (
        <p role="status">
          {zh
            ? "需要至少两个通过检查的成员，才能进行多构象比较。"
            : "At least two qualified members are needed for multi-conformation comparison."}
        </p>
      )}
      {loading && (
        <p role="status">
          {zh ? "读取已登记的受体集合…" : "Loading indexed receptor ensemble…"}
        </p>
      )}
      {!loading && !error && !sets.length && (
        <p role="status">
          {zh
            ? "尚未登记可复用集合，请在任务资产登记中检查并重试。"
            : "No reusable ensemble was indexed. Check task asset indexing and retry."}
        </p>
      )}
      {data.members.map((row) => (
        <details className="receptor-input" key={row.index}>
          <summary>
            {zh ? "受体" : "Receptor"} {row.index + 1} ·{" "}
            {row.status === "reference"
              ? zh
                ? "参照结构"
                : "Reference"
              : row.status === "aligned"
                ? zh
                  ? "已对齐"
                  : "Aligned"
                : zh
                  ? "未通过"
                  : "Rejected"}
            {row.transformation
              ? ` · Cα RMSD ${row.transformation.rmsd_angstrom.toFixed(3)} Å`
              : ""}
          </summary>
          {row.reason && <p role="alert">{row.reason}</p>}
          {row.correspondence && (
            <p>
              {zh ? "匹配锚点" : "Matched anchors"}:{" "}
              {row.correspondence.pair_count} ·{" "}
              {zh ? "序列一致率" : "Sequence identity"}:{" "}
              {(row.correspondence.identity * 100).toFixed(1)}% ·{" "}
              {zh ? "覆盖率" : "Coverage"}:{" "}
              {(row.correspondence.coverage * 100).toFixed(1)}%
            </p>
          )}
          {row.quality && (
            <p>
              {zh ? "模型" : "Model"} {row.quality.selected_model_index + 1} ·{" "}
              {zh ? "链" : "Chains"} {row.quality.selected_chains.join(", ")} ·{" "}
              {row.quality.atom_count} {zh ? "个原子" : "atoms"}
              {!row.quality.backbone_complete
                ? " · " +
                  (zh
                    ? "骨架不完整，仅用于几何比较"
                    : "Incomplete backbone; geometry comparison only")
                : ""}
            </p>
          )}
          {row.artifact && (
            <div className="receptor-actions">
              <button
                type="button"
                className="secondary-button"
                aria-pressed={selected === row.index}
                onClick={() => {
                  setSelected(row.index);
                  setNext(false);
                }}
              >
                {zh ? "叠合预览此受体" : "Overlay this receptor"}
              </button>
              <a href={artifactUrl(job.id, row.artifact)} download>
                {zh ? "下载对齐结构" : "Download aligned structure"}
              </a>
            </div>
          )}
          <details>
            <summary>
              {zh
                ? "来源、对应与变换"
                : "Source, correspondence and transformation"}
            </summary>
            <pre>
              {JSON.stringify(
                {
                  source: row.source,
                  transformation: row.transformation,
                  quality: row.quality,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </details>
      ))}
      {urls.length > 0 && !next && (
        <StructureViewer urls={urls} language={language} />
      )}
      {saved && member?.quality?.backbone_complete && !next && (
        <button
          className="secondary-button"
          type="button"
          onClick={() => setNext(true)}
        >
          {zh ? "用此受体寻找口袋" : "Find pockets on this receptor"}
        </button>
      )}
      {next && saved && (
        <PocketForm
          key={`${saved.asset_id}:${saved.version_id}`}
          language={language}
          initialProtein={saved}
          onCreated={(j) => setMessage(j.id)}
          onPredict={() =>
            setMessage(
              zh
                ? "可从左侧结构预测建立新的结构。"
                : "Use Structure prediction in the sidebar to build another structure.",
            )
          }
        />
      )}
      <details>
        <summary>{zh ? "方法版本" : "Method versions"}</summary>
        <p>
          {Object.entries(data.versions)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </p>
      </details>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
