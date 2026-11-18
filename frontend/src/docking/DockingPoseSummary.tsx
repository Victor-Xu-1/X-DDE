import { DownloadOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { artifactUrl } from "../api";
import { CandidateReviewMetrics } from "../presentation/CandidateReviewBar";
import type { Language } from "../types";
import type { NativePoseScore } from "../viewer/PoseScore";
import { scoreLabel } from "./scoreLabels";
import type { PoseResult } from "./types";

export function DockingPoseSummary({
  jobId,
  pose,
  nativeScore,
  language,
  children,
}: {
  jobId: string;
  pose?: PoseResult;
  nativeScore: NativePoseScore | null;
  language: Language;
  children: ReactNode;
}) {
  const zh = language === "zh";
  if (!pose?.artifact) return children;
  const metrics = [
    ...(nativeScore
      ? [
          {
            label: zh ? "整姿势对接分数" : "Whole-pose docking score",
            value: nativeScore.value.toFixed(3),
            detail: nativeScore.unit,
          },
        ]
      : []),
    ...["CNNscore", "CNNaffinity"].flatMap((name) => {
      const score = pose.scores.find(
        (entry) =>
          entry.name === name &&
          entry.unit === "model_output" &&
          Number.isFinite(entry.value),
      );
      return score
        ? [
            {
              label: scoreLabel(name, language),
              value: score.value.toFixed(3),
              detail: zh ? "模型输出" : "model output",
            },
          ]
        : [];
    }),
  ];
  return (
    <section
      className="docking-pose-summary"
      aria-label={zh ? "所选姿势分数" : "Selected pose scores"}
    >
      <header>
        <strong>
          {zh ? "姿势 " : "Pose "}
          {pose.record + 1}
        </strong>
        <a
          className="secondary-button"
          href={artifactUrl(jobId, pose.artifact)}
          download
          aria-label={zh ? "下载所选姿势 SDF" : "Download selected pose SDF"}
        >
          <DownloadOutlined aria-hidden="true" /> {zh ? "姿势 SDF" : "Pose SDF"}
        </a>
      </header>
      <CandidateReviewMetrics metrics={metrics} />
      {children}
    </section>
  );
}
