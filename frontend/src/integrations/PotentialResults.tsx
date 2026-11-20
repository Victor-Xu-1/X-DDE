import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { SpatialResultSummary } from "../presentation/SpatialResultSummary";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeResult } from "./types";
import { useState } from "react";
import "./potential-results.css";
import "../presentation/spatial-result-review.css";

const metricLabels = new Map([
  ["Ionic strength", "离子强度"],
  ["Temperature", "温度"],
]);

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
    <section className="spatial-results apbs-result spatial-review">
      <StructureWorkbench
        preview={
          <StructureViewer
            urls={[artifactUrl(job.id, result.structure_artifact)]}
            language={language}
            electrostaticMap={{
              url: artifactUrl(job.id, result.potential_artifact),
              unit: "kBT/e",
              range,
            }}
          />
        }
      >
        <SpatialResultSummary
          jobId={job.id}
          language={language}
          title={zh ? "电势结果" : "Potential result"}
          metrics={result.metrics.map(({ name, value, unit }) => ({
            label: zh ? (metricLabels.get(name) ?? name) : name,
            value,
            unit: unit === name ? undefined : unit,
          }))}
          files={[
            {
              artifact: result.potential_artifact,
              label: zh ? "电势网格" : "Potential grid",
              downloadLabel: zh ? "下载电势网格" : "Download potential grid",
            },
            {
              artifact: result.structure_artifact,
              label: zh ? "对应结构" : "Structure",
              downloadLabel: zh
                ? "下载对应结构"
                : "Download calculated structure",
            },
          ]}
        >
          <label className="apbs-result-range">
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
        </SpatialResultSummary>
      </StructureWorkbench>
    </section>
  );
}
