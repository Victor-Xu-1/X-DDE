import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import { artifactUrl } from "../api";
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
  const zh = language === "zh",
    mode = String(data.mode ?? "");
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
  if (mode === "prepare")
    return (
      <section>
        <dl className="native-result-metrics">
          {["input_atoms", "output_atoms", "removed_atoms"].map(
            (k, i) =>
              typeof data[k] === "number" && (
                <div key={k}>
                  <dt>
                    {
                      (zh
                        ? ["原始原子", "保留原子", "移除原子"]
                        : ["Input atoms", "Retained atoms", "Removed atoms"])[i]
                    }
                  </dt>
                  <dd>{String(data[k])}</dd>
                </div>
              ),
          )}
        </dl>
        {typeof data.structure === "string" && (
          <a
            className="research-download"
            href={artifactUrl(job.id, data.structure)}
            download
          >
            {zh ? "下载准备好的受体" : "Download prepared receptor"}
          </a>
        )}
      </section>
    );
  return null;
}
