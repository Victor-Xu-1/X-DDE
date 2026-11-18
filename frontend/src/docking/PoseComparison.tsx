import { artifactUrl } from "../api";
import { useLayoutEffect, useRef } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Language } from "../types";
import type { DockingResult, PoseResult } from "./types";
import "./PoseComparison.css";

/** Display only: both poses retain the same task's exact receptor coordinate frame. */
export function PoseComparison({
  jobId,
  result,
  poses,
  language,
  onInspect,
  onClose,
}: {
  jobId: string;
  result: DockingResult;
  poses: readonly PoseResult[];
  language: Language;
  onInspect(pose: PoseResult): void;
  onClose(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = poses[0]?.artifact;
  const second = poses[1]?.artifact;
  useLayoutEffect(() => {
    heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [jobId, first, second]);
  if (poses.length !== 2 || poses.some((pose) => !pose.valid || !pose.artifact))
    return null;
  const zh = language === "zh";
  return (
    <section
      className="pose-comparison"
      aria-label={
        zh ? "结合姿势三维比较" : "Binding pose structural comparison"
      }
    >
      <div className="section-heading">
        <h3 ref={heading} tabIndex={-1}>
          {zh ? "结合姿势比较" : "Compare binding poses"}
        </h3>
        <button type="button" className="secondary-button" onClick={onClose}>
          {zh ? "返回单个姿势" : "Return to single pose"}
        </button>
      </div>
      <p className="field-help">
        {zh
          ? "叠合保留同一受体中的原始姿势。请分别核查各姿势的接触和质控结果。"
          : "The overlay preserves the original poses in the same receptor frame. Inspect the contacts and quality checks for each pose separately."}
      </p>
      <div className="pose-comparison-sources">
        {poses.map((pose, index) => (
          <span key={pose.record}>
            <button
              type="button"
              className="text-button"
              onClick={() => onInspect(pose)}
            >
              {zh ? "姿势 " : "Pose "}
              {pose.record + 1}
              {index === 0
                ? zh
                  ? " · 橙色碳"
                  : " · Orange carbon"
                : zh
                  ? " · 紫色碳"
                  : " · Purple carbon"}
            </button>{" "}
            <a href={artifactUrl(jobId, pose.artifact!)} download>
              {zh ? "下载 SDF" : "Download SDF"}
            </a>
          </span>
        ))}
      </div>
      <StructureViewer
        key={JSON.stringify([jobId, poses.map((pose) => pose.artifact)])}
        urls={[
          artifactUrl(jobId, result.receptor_artifact),
          ...poses.map((pose) => artifactUrl(jobId, pose.artifact!)),
        ]}
        language={language}
        sourceSnapshot
        comparison
        focusModels={[1, 2]}
        records={[0, 0, 0]}
      />
    </section>
  );
}
