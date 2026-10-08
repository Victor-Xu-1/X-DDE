import "../presentation/ensemble-results.css";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { Hint } from "../guided/Hint";
import { useEffect, useState } from "react";
import { artifactUrl, request } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { PocketForm } from "../pockets/PocketForm";
import { ReceptorMemberTable } from "./ReceptorMemberTable";
import { ReceptorMemberDetails } from "./ReceptorMemberDetails";
import type { Job, Language } from "../types";
import type { ReceptorResult, ReceptorSet } from "./types";
import "./receptors.css";
import { SiteWorkspace } from "../sites/SiteWorkspace";

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
  const initialSelection =
    data.members.find((row) => row.artifact && row.status === "aligned")
      ?.index ??
    data.members.find((row) => row.artifact)?.index ??
    data.members[0]?.index ??
    null;
  const [sets, setSets] = useState<ReceptorSet[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<number | null>(initialSelection),
    [next, setNext] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSets([]);
    setError("");
    setSelected(initialSelection);
    setNext(false);
    void request<ReceptorSet[]>(
      "/research/receptor-ensembles?source_job=" + encodeURIComponent(job.id),
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setSets(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [job.id, initialSelection]);
  const member = data.members.find((row) => row.index === selected),
    reference = data.members.find(
      (row) => row.index === data.options.reference_index,
    ),
    saved = sets
      .flatMap((set) => set.members)
      .find((row) => row.evidence.index === selected)?.reference;
  const urls = member?.artifact
    ? [
        ...new Set(
          [reference?.artifact, member.artifact].filter(
            (file): file is string => !!file,
          ),
        ),
      ].map((file) => artifactUrl(job.id, file))
    : [];
  if (next && saved)
    return (
      <ResearchHandoff language={language} onBack={() => setNext(false)}>
        <PocketForm
          language={language}
          initialProtein={saved}
          onCreated={() =>
            setMessage(zh ? "新任务已创建。" : "New task created.")
          }
          onPredict={() =>
            setMessage(
              zh
                ? "可从左侧结构预测建立新的结构。"
                : "Use Structure prediction in the sidebar.",
            )
          }
        />
        {message && <p role="status">{message}</p>}
      </ResearchHandoff>
    );
  return (
    <section
      className="receptor-results"
      aria-label={zh ? "受体构象集合结果" : "Receptor ensemble results"}
      aria-busy={loading}
    >
      <header className="ensemble-result-heading">
        <h3>
          {zh ? "已对齐受体" : "Aligned receptors"}{" "}
          <span className="ensemble-count">
            {data.qualified_count} / {data.members.length}
          </span>
        </h3>
        <Hint label={zh ? "结构对齐说明" : "Structural alignment help"}>
          {zh
            ? "这是已有结构的刚体对齐。骨架与坐标检查不代表完整原子参数化；B 因子不自动解释为预测置信度。"
            : "Rigid alignment of supplied structures. Coordinate and backbone checks do not imply full atom parameterization; B-factors are not automatically prediction confidence."}
        </Hint>
      </header>
      {data.qualified_count < 2 && (
        <p role="status" className="field-help">
          {zh
            ? "需要至少两个通过检查的成员，才能进行多构象比较。"
            : "At least two qualified members are needed for multi-conformation comparison."}
        </p>
      )}
      <div className="ensemble-result-layout">
        <div className="ensemble-result-list">
          <h3>{zh ? "选择受体" : "Select a receptor"}</h3>
          <ReceptorMemberTable
            members={data.members}
            selected={selected}
            language={language}
            onSelect={(index) => {
              setSelected(index);
              setNext(false);
            }}
          />
          {member && (
            <ReceptorMemberDetails
              member={member}
              jobId={job.id}
              language={language}
            />
          )}
        </div>
        <section
          className="receptor-overlay-detail"
          aria-label={zh ? "所选受体预览" : "Selected receptor preview"}
        >
          <header className="ensemble-result-heading">
            <h3>
              {member
                ? (zh ? "受体 " : "Receptor ") + (member.index + 1)
                : zh
                  ? "结构预览"
                  : "Structure preview"}
            </h3>
          </header>
          {urls.length > 0 ? (
            <>
              <StructureViewer
                key={job.id + ":" + selected}
                urls={urls}
                language={language}
                comparison={urls.length > 1}
              />
              <p className="field-help receptor-overlay-legend">
                {urls.length > 1
                  ? zh
                    ? "蓝色：参照 · 橙色：所选受体。完全重合时可互相遮挡。"
                    : "Blue: reference · Orange: selected receptor. Identical overlays can occlude each other."
                  : zh
                    ? "当前显示单个结构。"
                    : "One structure is displayed."}
              </p>
              {saved && member?.quality?.backbone_complete && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setNext(true)}
                >
                  {zh ? "用此受体寻找口袋" : "Find pockets on this receptor"}
                </button>
              )}
            </>
          ) : (
            <div className="ensemble-empty-preview" role="status">
              <strong>
                {zh
                  ? "没有可查看的对齐结构"
                  : "No aligned structure to inspect"}
              </strong>
              <p>
                {zh
                  ? "查看所选成员的原因，或选择其他受体。"
                  : "Inspect the selected member's reason or choose another receptor."}
              </p>
            </div>
          )}
        </section>
      </div>
      {loading && (
        <p role="status">
          {zh
            ? "正在读取可继续使用的结构…"
            : "Loading structures for the next step…"}
        </p>
      )}
      {!loading && !error && !sets.length && (
        <p role="status" className="field-help">
          {zh
            ? "结构尚未登记为历史文件，暂时不能用于下一步。请刷新后重试。"
            : "These structures are not yet available as historical files for the next step. Refresh and try again."}
        </p>
      )}
      {!loading && sets.length > 0 && data.qualified_count >= 2 && (
        <details>
          <summary>
            {zh ? "比较各构象的口袋" : "Compare pockets across conformations"}
          </summary>
          <SiteWorkspace ensemble={sets[0]} language={language} />
        </details>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
