import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { artifactUrl } from "../api";
import { ResultTree } from "../operations/StructuredResults";
import { InteractionResults } from "./InteractionResults";
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
    return (
      <section>
        <h3>
          {zh ? "口袋包含的残基" : "Residues in the pocket"}:{" "}
          {String(data.residue_count ?? "—")}
        </h3>
        {typeof data.pocket_artifact === "string" && (
          <StructureViewer
            urls={[artifactUrl(job.id, data.pocket_artifact)]}
            language={language}
          />
        )}
        <details>
          <summary>{zh ? "查看口袋残基" : "Inspect pocket residues"}</summary>
          <ResultTree value={data.residues} zh={zh} />
        </details>
      </section>
    );
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
