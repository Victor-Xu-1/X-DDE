import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import { InteractionResults } from "./InteractionResults";
import { ReferencePocketResults } from "./ReferencePocketResults";
export function ScientificDetails({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const mode =
    job.request.operation === "diffsbdd"
      ? job.request.payload.mode
      : String(data.mode ?? "");
  if (mode === "interactions" && Array.isArray(data.interactions))
    return (
      <InteractionResults
        key={job.id}
        job={job}
        data={data}
        language={language}
      />
    );
  if (mode === "pocket")
    return <ReferencePocketResults job={job} data={data} language={language} />;
  return null;
}
