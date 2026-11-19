import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Job, Language } from "../types";
import type { NativeResult } from "./types";
import { useState } from "react";
import "./potential-results.css";

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
    <section className="apbs-result">
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
        <section className="apbs-result-summary" aria-label={zh ? "电势结果" : "Potential result"}>
          <label className="apbs-result-range">
            {zh ? "颜色范围" : "Color range"}
            <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
              {[2, 5, 10].map((n) => (
                <option key={n} value={n}>
                  −{n} … +{n} kBT/e
                </option>
              ))}
            </select>
          </label>
          {result.metrics.length > 0 && (
            <table aria-label={zh ? "计算条件" : "Calculation conditions"}>
              <tbody>
                {result.metrics.map(({ name, value, unit }) => (
                  <tr key={name}>
                    <th scope="row">{zh ? (metricLabels.get(name) ?? name) : name}</th>
                    <td>{value}{unit && unit !== name && <small> {unit}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="apbs-result-downloads">
            <a
              className="secondary-button"
              href={artifactUrl(job.id, result.potential_artifact)}
              aria-label={zh ? "下载电势网格" : "Download potential grid"}
              download
            >
              {zh ? "电势网格" : "Potential grid"}
            </a>
            <a
              className="secondary-button"
              href={artifactUrl(job.id, result.structure_artifact)}
              aria-label={zh ? "下载对应结构" : "Download calculated structure"}
              download
            >
              {zh ? "对应结构" : "Structure"}
            </a>
          </div>
        </section>
      </StructureWorkbench>
    </section>
  );
}
