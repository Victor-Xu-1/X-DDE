import { CandidateSetResults, EvolutionResults } from "./CandidateSetResults";
import { TargetMsaResults } from "./TargetMsaResults";
import type { Job, Language } from "../types";
import type { OperationResult } from "./types";
import { ResultTree } from "./StructuredResults";
import { unwrapResult } from "../presentation/research-content";
import { NativeReport } from "./NativeReport";
import { CandidateSequenceResults } from "./CandidateSequenceResults";
import { EpitopeResults } from "./EpitopeResults";
import { SequenceScoreResults } from "./SequenceScoreResults";
import { StructureComparisonResults } from "./StructureComparisonResults";
import {
  resultStructureFiles,
  sequenceCandidateResult,
} from "./candidate-structures";
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
  const candidates = sequenceCandidateResult(job, data);
  if (candidates) {
    return (
      <CandidateSequenceResults
        job={job}
        candidates={candidates}
        structures={resultStructureFiles(data)}
        language={language}
      />
    );
  }
  if (tool === "epitope")
    return <EpitopeResults job={job} value={content} language={language} />;
  if (tool === "target-msa" && content.available === true)
    return <TargetMsaResults job={job} value={content} language={language} />;
  if (tool === "compare" && content.legacy && content.opendde_harness)
    return <CandidateSetResults value={content} language={language} />;
  if (tool === "evolution" && typeof content.candidate_count === "number")
    return <EvolutionResults value={content} language={language} />;
  if (typeof value === "string")
    return <NativeReport text={value} zh={zh} job={job} />;
  return <ResultTree value={value} zh={zh} />;
}
