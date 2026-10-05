import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeResult } from "./types";
import { useState } from "react";

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
  const [range, setRange] = useState(5);
  if (!result.structure_artifact || !result.potential_artifact) return null;
  return (
    <section>
      <label className="inline-fields">
        {zh ? "颜色范围" : "Color range"}
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
        >
          {[2, 5, 10].map((n) => (
            <option key={n} value={n}>
              −{n} … +{n} kBT/e
            </option>
          ))}
        </select>
      </label>
      <StructureViewer
        urls={[artifactUrl(job.id, result.structure_artifact)]}
        language={language}
        electrostaticMap={{
          url: artifactUrl(job.id, result.potential_artifact),
          unit: "kBT/e",
          range,
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
