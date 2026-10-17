import { useState } from "react";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { PoseQualityResult } from "./types";

/** Inspect the exact checked pose and reference without optimisation or alignment. */
export function QualityPreview({
  job,
  result,
  language,
}: {
  job: Job;
  result: PoseQualityResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [overlay, setOverlay] = useState(false);
  const names = ["protein-preview.pdb", "molecule-preview.sdf"].filter((name) =>
    Object.hasOwn(result.previews_sha256, name),
  );
  const moleculeIndex = names.indexOf("molecule-preview.sdf");
  const reference = result.inputs.reference;
  const canCompare =
    moleculeIndex >= 0 &&
    reference &&
    result.options?.profile === "redock" &&
    result.coordinate_basis === "user_confirmed";
  const comparing = Boolean(canCompare && overlay);
  const urls = names.map((name) => artifactUrl(job.id, name));
  const records = names.map(() => 0);
  if (comparing && reference) {
    urls.push(`/api/assets/${encodeURIComponent(reference.asset_id)}`);
    records.push(reference.record);
  }
  if (!urls.length)
    return (
      <div className="result-inspection-empty" role="status">
        <p>
          {zh
            ? "本次质控未提供可预览的结构。"
            : "This quality result contains no preview structure."}
        </p>
      </div>
    );
  return (
    <>
      {canCompare && (
        <div
          className="quality-preview-modes"
          role="group"
          aria-label={zh ? "姿势对照视图" : "Pose comparison view"}
        >
          <button
            type="button"
            className="secondary-button"
            aria-pressed={!overlay}
            onClick={() => setOverlay(false)}
          >
            {zh ? "检查姿势" : "Checked pose"}
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={overlay}
            onClick={() => setOverlay(true)}
          >
            {zh ? "实验参考叠合" : "Experimental overlay"}
          </button>
          {comparing && (
            <span>
              {zh
                ? "原位叠合 · 未做拟合"
                : "Original receptor frame · no alignment"}
            </span>
          )}
        </div>
      )}
      <StructureViewer
        sourceSnapshot
        urls={urls}
        records={records}
        language={language}
        comparison={comparing}
        focusModel={moleculeIndex >= 0 ? moleculeIndex : 0}
        focusModels={comparing ? [moleculeIndex, urls.length - 1] : undefined}
        molecularSource={
          moleculeIndex >= 0
            ? { url: artifactUrl(job.id, "molecule-preview.sdf") }
            : undefined
        }
      />
    </>
  );
}
