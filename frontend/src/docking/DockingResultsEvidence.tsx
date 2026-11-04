import { useEffect, useState } from "react";
import { artifactUrl, request } from "../api";
import { referenceKey } from "../diffsbdd/model";
import type { ExampleInfo } from "../examples/types";
import { readArtifactFile } from "../presentation/artifact-file";
import { assessQuality, type AssessmentOutcome } from "../quality/assessment";
import { assessmentLabels } from "../quality/labels";
import type { PoseQualityResult } from "../quality/types";
import type { Language } from "../types";
import type { DockingResult, PoseResult } from "./types";
import "./DockingResultsEvidence.css";

interface Report {
  id: string;
  version: string;
  counts: ReturnType<typeof assessQuality>["counts"];
}

type PoseEvidence = ReadonlyMap<string, Report[]>;

async function readEvidence(
  jobId: string,
  docking: DockingResult,
  signal: AbortSignal,
): Promise<PoseEvidence | null> {
  // This endpoint verifies the sealed source and supporting artifacts server-side.
  const { pin } = await request<ExampleInfo>("/examples/gnina.dock", {
    signal,
  });
  if (
    pin?.job_id !== jobId ||
    !pin.review ||
    !pin.supporting_evidence?.length ||
    pin.artifact_sha256[docking.receptor_artifact] !== docking.receptor.sha256
  )
    return null;

  const evidence = new Map<string, Report[]>();
  const receptor = referenceKey(docking.receptor);
  const verified = await Promise.all(
    pin.supporting_evidence.map(async ({ job_id: id, artifact_sha256 }) => {
      const sha256 = artifact_sha256["result.json"];
      if (!sha256) return { id, result: null };
      const { bytes } = await readArtifactFile(
        artifactUrl(id, "result.json"),
        signal,
        { maxBytes: 4 * 1024 ** 2, sha256 },
      );
      const result = JSON.parse(
        new TextDecoder().decode(bytes),
      ) as PoseQualityResult;
      return { id, result };
    }),
  );

  for (const { id, result } of verified) {
    if (
      result?.operation !== "pose_quality" ||
      result.complete !== true ||
      !Array.isArray(result.checks) ||
      result.options?.profile !== "dock" ||
      referenceKey(result.inputs?.protein ?? null) !== receptor ||
      !result.versions?.posebusters
    )
      continue;
    const ligand = result.inputs.molecule;
    if (!ligand || ligand.record !== 0 || ligand.conformer !== 0) continue;
    // The pin enforces version lineage. The exact artifact hash identifies
    // the candidate without relying on task names or display order.
    const poses = docking.poses.filter(
      (pose) =>
        pose.valid &&
        pose.artifact &&
        pin.artifact_sha256[pose.artifact] === ligand.sha256,
    );
    const artifact = poses.length === 1 ? poses[0].artifact : undefined;
    if (!artifact) continue;
    const reports = evidence.get(artifact) ?? [];
    reports.push({
      id,
      version: result.versions.posebusters,
      counts: assessQuality(result).counts,
    });
    evidence.set(artifact, reports);
  }
  return evidence.size ? evidence : null;
}

export function DockingResultsEvidence({
  jobId,
  result,
  pose,
  language,
}: {
  jobId: string;
  result: DockingResult;
  pose?: PoseResult;
  language: Language;
}) {
  const [loaded, setLoaded] = useState<{
    jobId: string;
    result: DockingResult;
    evidence: PoseEvidence;
  } | null>(null);
  useEffect(() => {
    if (result.mode !== "dock" || result.receptor_refinement) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(12000),
    ]);
    void readEvidence(jobId, result, signal)
      .then((evidence) => {
        if (evidence && !signal.aborted) setLoaded({ jobId, result, evidence });
      })
      .catch(() => {
        // A missing or unverifiable optional report never blocks native results.
      });
    return () => controller.abort();
  }, [jobId, result]);
  if (loaded?.jobId !== jobId || loaded.result !== result || !pose?.artifact)
    return null;

  const zh = language === "zh";
  const reports = loaded.evidence.get(pose.artifact);
  return (
    <section
      className="docking-pose-evidence"
      aria-label={
        zh ? "所选姿势的独立质控" : "Independent quality for selected pose"
      }
    >
      <h3>
        {zh ? "原始姿势 " : "Original pose "}
        {pose.record + 1}
        {zh ? " · 独立质控" : " · Independent quality"}
      </h3>
      {reports ? (
        reports.map(({ id, version, counts }) => (
          <div className="docking-pose-report" key={id}>
            <div className="docking-pose-checks">
              {Object.entries(assessmentLabels).map(([key, labels]) => {
                const count = counts[key as AssessmentOutcome];
                return count ? (
                  <span key={key}>
                    {count}{" "}
                    {!zh && key === "pass"
                      ? "passed"
                      : labels[zh ? 0 : 1].toLowerCase()}
                  </span>
                ) : null;
              })}
            </div>
            <a
              href={"/#task=" + encodeURIComponent(id)}
              target="_blank"
              rel="noopener"
            >
              {zh ? "查看报告" : "View report"} · PoseBusters {version}
            </a>
          </div>
        ))
      ) : (
        <p>
          {zh
            ? "该案例中，此姿势没有关联的独立质控报告。"
            : "No independent quality report is linked to this pose in the case."}
        </p>
      )}
    </section>
  );
}
