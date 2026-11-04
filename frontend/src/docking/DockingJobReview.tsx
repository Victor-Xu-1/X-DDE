import {
  PredictionJobReview,
  type PredictionJobReviewActions,
} from "../presentation/PredictionJobReview";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { researchError } from "../presentation/research-content";
import { useState } from "react";
import { assetDownloadUrl } from "../research/asset-download";
import type { Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { DockingReview } from "./DockingReview";
import { prepareDockingJob, type DockingJobInput } from "./docking-job-request";
import type { DockingTask } from "./types";
import "./docking-job-review.css";

export function DockingJobReview(
  props: PredictionJobReviewActions<DockingTask> & { input: DockingJobInput },
) {
  const { language } = props;
  return (
    <PredictionJobReview
      {...props}
      wide
      prepare={prepareDockingJob}
      preparationError={(reason) => researchError(reason, language === "zh")}
      summary={() =>
        language === "zh"
          ? "GNINA · 核对受体坐标与分子输入"
          : "GNINA · Review receptor coordinates and molecules"
      }
      renderOverview={({ task }) => (
        <DockingGeometry task={task} language={language} />
      )}
      renderSettings={({ task }) => (
        <aside className="job-review-settings docking-review-settings">
          <DockingReview getTask={() => task} enabled language={language} />
        </aside>
      )}
    />
  );
}

function DockingGeometry({
  task,
  language,
}: {
  task: DockingTask;
  language: Language;
}) {
  const [studyOpen, setStudyOpen] = useState(false);
  const zh = language === "zh";
  const search = task.search;
  const reference = search?.kind === "reference_ligand";
  const pose = reference
    ? search.reference
    : task.mode !== "dock"
      ? task.ligand
      : null;
  const urls = [assetDownloadUrl(task.receptor.asset_id)];
  if (pose) urls.push(assetDownloadUrl(pose.asset_id, pose.record));
  const title = zh ? "受体坐标系" : "Receptor coordinate frame";
  const studyMolecule = zh ? "研究分子的二维结构" : "Study molecule in 2D";
  return (
    <section className="docking-review-geometry" aria-label={title}>
      <h3>{title}</h3>
      <p className="field-help">
        {reference
          ? zh
            ? `参考配体按已确认的受体坐标叠加。GNINA 运行时以参考配体为基准，留白 ${task.options.autobox_add} Å。`
            : `The reference pose is overlaid in the confirmed receptor frame. GNINA uses a ${task.options.autobox_add} Å margin around it at run time.`
          : search?.kind === "box"
            ? zh
              ? "搜索盒采用已选的中心坐标和边长。"
              : "The box shows the selected center and edge lengths."
            : zh
              ? "显示待评分或优化的输入姿势，坐标按确认的受体坐标系保留。"
              : "The input pose is shown in the confirmed receptor frame."}
      </p>
      <StructureViewer
        urls={urls}
        language={language}
        sourceSnapshot
        focusModel={pose ? 1 : undefined}
        searchBox={search?.kind === "box" ? search.box : undefined}
      />
      {task.mode === "dock" && (
        <details
          className="docking-review-molecule"
          onToggle={(event) => setStudyOpen(event.currentTarget.open)}
        >
          <summary>{studyMolecule}</summary>
          <p className="field-help">
            {zh
              ? "此分子将在搜索中生成候选姿势。"
              : "Docking will search for candidate poses of this molecule."}
          </p>
          {studyOpen && (
            <MoleculeImage
              language={language}
              source={{
                url: assetDownloadUrl(task.ligand.asset_id, task.ligand.record),
              }}
              label={studyMolecule}
            />
          )}
        </details>
      )}
    </section>
  );
}
