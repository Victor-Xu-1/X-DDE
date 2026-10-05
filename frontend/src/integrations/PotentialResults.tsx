import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeResult } from "./types";

export function PotentialResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: NativeResult;
  language: Language;
}) {
  const zh = language === "zh";
  if (!result.structure_artifact || !result.potential_artifact) return null;
  return (
    <section>
      <StructureViewer
        urls={[artifactUrl(job.id, result.structure_artifact)]}
        language={language}
        electrostaticMap={{
          url: artifactUrl(job.id, result.potential_artifact),
          unit: "kBT/e",
        }}
      />
      <div className="inline-fields">
        {result.metrics.map((m) => (
          <span key={m.name}>
            {m.name}: {m.value} {m.unit}
          </span>
        ))}
      </div>
      <div className="download-actions">
        <a
          className="secondary-button"
          href={artifactUrl(job.id, result.potential_artifact)}
          download
        >
          {zh ? "下载电势网格" : "Download potential grid"}
        </a>
        <a
          className="secondary-button"
          href={artifactUrl(job.id, result.structure_artifact)}
          download
        >
          {zh ? "下载对应结构" : "Download calculated structure"}
        </a>
      </div>
    </section>
  );
}
