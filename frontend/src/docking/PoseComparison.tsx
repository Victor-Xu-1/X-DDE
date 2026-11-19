import { artifactUrl } from "../api";
import { useLayoutEffect, useRef } from "react";
import { StructureViewer } from "../viewer/StructureViewer";
import { BoundPoseComparison } from "../simulations/BoundPoseComparison";
import type { StructureSource } from "../simulations/molstar-controller";
import type { Language } from "../types";
import type { DockingResult, PoseResult } from "./types";
import "./PoseComparison.css";

/** Display only: both poses retain the same task's exact receptor coordinate frame. */
export function PoseComparison({
  jobId,
  result,
  poses,
  language,
  activation,
  onInspect,
  onClose,
}: {
  jobId: string;
  result: DockingResult;
  poses: readonly PoseResult[];
  language: Language;
  activation: number;
  onInspect(pose: PoseResult): void;
  onClose(): void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, [activation]);
  const [first, second] = poses;
  if (
    poses.length !== 2 ||
    !first?.valid ||
    !second?.valid ||
    !first.artifact ||
    !second.artifact
  )
    return null;
  const zh = language === "zh";
  const label = (pose: PoseResult) =>
    (zh ? "姿势 " : "Pose ") + (pose.record + 1);
  const firstUrl = artifactUrl(jobId, first.artifact);
  const secondUrl = artifactUrl(jobId, second.artifact);
  const receptor = artifactUrl(jobId, result.receptor_artifact);
  const labels = [label(first), label(second)] as const;
  const sources: StructureSource[] = [
    { url: receptor, format: "pdb", role: "protein" },
    { url: firstUrl, format: "sdf", role: "ligand", label: labels[0] },
    { url: secondUrl, format: "sdf", role: "ligand", label: labels[1] },
  ];
  const actions = (pose: PoseResult, url: string) => (
    <div className="pose-comparison-panel-actions">
      <button
        type="button"
        className="text-button"
        aria-label={zh ? `检查${label(pose)}` : `Inspect ${label(pose)}`}
        onClick={() => onInspect(pose)}
      >
        {zh ? "单独检查" : "Inspect"}
      </button>
      <a
        href={url}
        download
        aria-label={
          zh ? `下载${label(pose)} SDF` : `Download ${label(pose)} SDF`
        }
      >
        SDF ↓
      </a>
    </div>
  );
  const overlayView = (
    <>
      <div className="pose-comparison-sources">
        {[first, second].map((pose, index) => (
          <span key={pose.record}>
            <button
              type="button"
              className="text-button"
              onClick={() => onInspect(pose)}
            >
              {labels[index]}
              {index === 0
                ? zh
                  ? " · 橙色碳"
                  : " · Orange carbon"
                : zh
                  ? " · 紫色碳"
                  : " · Purple carbon"}
            </button>
            <a href={sources[index + 1].url} download>
              {zh ? "下载 SDF" : "Download SDF"}
            </a>
          </span>
        ))}
      </div>
      <StructureViewer
        urls={[receptor, firstUrl, secondUrl]}
        language={language}
        sourceSnapshot
        comparison
        focusModels={[1, 2]}
        records={[0, 0, 0]}
      />
    </>
  );
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
          ? "两个姿势使用同一受体的原始坐标。"
          : "Both poses use the original coordinates in the same receptor frame."}
      </p>
      <BoundPoseComparison
        key={JSON.stringify(sources)}
        sources={sources}
        labels={labels}
        language={language}
        initialMode="overlay"
        overlayView={overlayView}
        poseActions={[actions(first, firstUrl), actions(second, secondUrl)]}
      />
    </section>
  );
}
