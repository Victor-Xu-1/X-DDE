import type { Job, Language } from "../types";
import type { OperationResult } from "./types";
import { ResultTree } from "./StructuredResults";
import { unwrapResult } from "../presentation/research-content";
import { NativeReport } from "./NativeReport";
import { mutationDescription } from "./sequence-result";
import { EpitopeResults } from "./EpitopeResults";
import { SequenceScoreResults } from "./SequenceScoreResults";
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function HarnessResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh",
    value = unwrapResult(data.result ?? data),
    content = object(value);
  const tool = job.request.operation === "harness" ? job.request.tool : "";
  if (tool === "esm" && Array.isArray(content.scores)) {
    const sequences =
      job.request.operation === "harness" &&
      Array.isArray(job.request.payload.sequences)
        ? (job.request.payload.sequences as string[])
        : [];
    return (
      <SequenceScoreResults
        sequences={sequences}
        scores={content.scores}
        language={language}
      />
    );
  }
  if (
    ["esm2", "mpnn", "fold"].includes(tool) &&
    Array.isArray(content.candidates)
  ) {
    const candidates = content.candidates.map(object);
    return (
      <section>
        <h3>
          {zh
            ? "得到 " + candidates.length + " 个候选"
            : candidates.length + " candidates returned"}
        </h3>
        <p className="field-help">
          {zh
            ? "以下为模型结果；序列与界面评分不等于实验结合活性。"
            : "These are model outputs; sequence and interface scores are not measured binding activity."}
        </p>
        <div className="research-candidate-list">
          {candidates.map((c, i) => {
            const metadata = object(c.metadata),
              allMetrics = object(c.metrics);
            const metrics = {
              ...Object.fromEntries(
                Object.entries(allMetrics).filter(([k]) =>
                  ["iptm", "ptm", "plddt", "ipsae", "ranking_score"].includes(
                    k,
                  ),
                ),
              ),
              ...Object.fromEntries(
                ["esm2_llr", "soluble_mpnn_scores", "soluble_mpnn_seqids"]
                  .filter((k) => metadata[k] != null)
                  .map((k) => [k, metadata[k]]),
              ),
            };
            const chains = object(c.chains ?? metadata.chains);
            return (
              <article className="research-candidate" key={i}>
                <h4>
                  {zh ? "候选" : "Candidate"} {i + 1}
                </h4>
                {Array.isArray(c.mutations) && (
                  <p>
                    {zh
                      ? "变更（序列位置从 1 开始）"
                      : "Changes (sequence positions start at 1)"}
                    : {c.mutations.map(mutationDescription).join("; ")}
                  </p>
                )}
                <ResultTree value={metrics} zh={zh} />
                <details>
                  <summary>
                    {zh
                      ? "完整序列与设计依据"
                      : "Full sequences and design evidence"}
                  </summary>
                  <ResultTree
                    value={{
                      ...(Object.keys(chains).length ? { chains } : {}),
                      ...(c.sequence ? { sequence: c.sequence } : {}),
                      ...(c.strategy ? { strategy: c.strategy } : {}),
                      ...(c.objective != null
                        ? { objective: c.objective }
                        : {}),
                      ...(c.risk_level ? { risk_level: c.risk_level } : {}),
                      ...(Object.keys(allMetrics).length
                        ? { metrics: allMetrics }
                        : {}),
                      ...(metadata.design_positions
                        ? { design_positions: metadata.design_positions }
                        : {}),
                      ...(metadata.gate_evidence
                        ? { gate_evidence: metadata.gate_evidence }
                        : {}),
                    }}
                    zh={zh}
                  />
                </details>
              </article>
            );
          })}
        </div>
      </section>
    );
  }
  if (tool === "epitope")
    return <EpitopeResults job={job} value={content} language={language} />;
  if (tool === "target-msa" && content.available === true) {
    const scientific = { ...content };
    delete scientific.available;
    return <ResultTree value={scientific} zh={zh} />;
  }
  if (tool === "evolution") {
    const shown = { ...content };
    if (shown.current_parent_id == null) delete shown.current_parent_id;
    const noTree = Object.keys(object(shown.trees)).length === 0;
    if (noTree) delete shown.trees;
    if (Object.keys(object(shown.conservation)).length === 0)
      delete shown.conservation;
    return (
      <section>
        {noTree && (
          <p className="field-help">
            {zh
              ? "本次没有形成可展示的父子谱系；仍可查看候选数和变异记录。"
              : "No displayable parent-child lineage was formed; candidate counts and mutation records remain available."}
          </p>
        )}
        <ResultTree value={shown} zh={zh} />
      </section>
    );
  }
  if (typeof value === "string")
    return <NativeReport text={value} zh={zh} job={job} />;
  return <ResultTree value={value} zh={zh} />;
}
