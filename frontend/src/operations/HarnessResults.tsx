import type { Job, Language } from "../types";
import type { OperationResult } from "./types";
import { ResultTree } from "./StructuredResults";
import { unwrapResult } from "../presentation/research-content";
import { NativeReport } from "./NativeReport";
import { CandidateSequenceResults } from "./CandidateSequenceResults";
import { EpitopeResults } from "./EpitopeResults";
import { SequenceScoreResults } from "./SequenceScoreResults";
import { StructureComparisonResults } from "./StructureComparisonResults";
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
  if (tool === "rmsd")
    return (
      <StructureComparisonResults
        job={job}
        value={content}
        language={language}
      />
    );
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
    return (
      <CandidateSequenceResults
        job={job}
        candidates={content.candidates.map(object)}
        structures={
          Array.isArray(data.structures)
            ? data.structures.filter(
                (value): value is string => typeof value === "string",
              )
            : []
        }
        language={language}
      />
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
