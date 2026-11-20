import { CandidateReviewBar } from "../presentation/CandidateReviewBar";
import { searchNotice } from "./searchNotice";
import { ReceptorRefinementSummary } from "./ReceptorRefinementSummary";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { poseScore } from "./poseScore";
import { PoseTable } from "./PoseTable";
import { DockingResultsEvidence } from "./DockingResultsEvidence";
import { PoseComparison } from "./PoseComparison";
import { DockingPoseSummary } from "./DockingPoseSummary";
import { ReferenceComparison } from "./ReferenceComparison";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { PoseViolations } from "./PoseViolations";
import "./results.css";
import "./DockingResults.css";
import "../presentation/spatial-result-review.css";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "./DockingForm";
import { usePoseAssets } from "./usePoseAssets";
import { poseAssetMessage, type PoseAssetTarget } from "./pose-asset-lookup";
import type { DockingResult } from "./types";
import { posePlan } from "../viewer/pose-plan";
import { usePoseHandoff } from "../viewer/usePoseHandoff";
import { PoseSession } from "../viewer/PoseSession";
import { PoseStudyInput } from "../viewer/PoseStudyInput";
import { QualityForm } from "../quality/QualityForm";
interface DockingResultsProps {
  job: Job;
  result: DockingResult;
  language: Language;
}

export function DockingResults(props: DockingResultsProps) {
  return <DockingWorkspace key={props.job.id} {...props} />;
}

function DockingWorkspace({ job, result, language }: DockingResultsProps) {
  const zh = language === "zh";
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    jobId: string;
    records: number[];
    activation: number;
  } | null>(null);
  const compared =
    comparison?.jobId === job.id
      ? result.poses.filter(
          (pose) =>
            comparison.records.includes(pose.record) &&
            pose.valid &&
            pose.artifact,
        )
      : [];
  const [record, setRecord] = useState<number | null>(
      () => result.poses.find((p) => p.valid && p.artifact)?.record ?? null,
    ),
    [message, setMessage] = useState("");
  const selected = result.poses.find(
    (v) => v.record === record && v.valid && v.artifact,
  );
  const nativeScore = selected ? poseScore(result, selected) : null;
  const qualified = result.poses.filter((pose) => pose.valid && pose.artifact);
  const inspectingPose = compared.length !== 2 && !diagnostic;
  const launcher = useRef<HTMLButtonElement | null>(null);
  const poseDetails = useRef<HTMLDivElement | null>(null);
  const posePreview = useRef<HTMLDivElement | null>(null);
  const comparisonReturn = useRef<"table" | "preview" | null>(null);
  useLayoutEffect(() => {
    const destination = comparisonReturn.current;
    if (compared.length || !destination) return;
    comparisonReturn.current = null;
    const preview = posePreview.current;
    const focused = preview?.closest('[data-workspace-focus="true"]');
    const previewControl =
      preview?.querySelector<HTMLElement>("[data-workspace-expand]") ?? preview;
    const button = launcher.current;
    const tableControl =
      button?.isConnected && !button.disabled
        ? button
        : poseDetails.current?.querySelector<HTMLInputElement>(
            'input[type="search"]',
          );
    const target =
      destination === "preview" || focused
        ? previewControl
        : (tableControl ?? previewControl);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({
      block: target === tableControl ? "center" : "nearest",
      behavior: "instant",
    });
  }, [compared.length]);
  const target: PoseAssetTarget | null = selected?.artifact
    ? { name: selected.artifact, kind: "molecule", record: 0 }
    : null;
  const receptorTarget: PoseAssetTarget | null =
    result.receptor_refinement && target
      ? { name: result.receptor_artifact, kind: "structure", record: 0 }
      : null;
  const assets = usePoseAssets(
    job.id,
    target ? [target, ...(receptorTarget ? [receptorTarget] : [])] : [],
  );
  const version = target ? assets.object(target) : undefined;
  const pairedReceptor = receptorTarget
    ? assets.object(receptorTarget)?.reference
    : result.receptor;
  const frame = {
    urls: selected?.artifact
      ? [
          artifactUrl(job.id, result.receptor_artifact),
          artifactUrl(job.id, selected.artifact),
        ]
      : [],
    molecularSource: selected?.artifact
      ? { url: artifactUrl(job.id, selected.artifact) }
      : undefined,
    nativeScore,
  };
  const wrap = (content: ReactNode) => (
    <PoseSession frame={frame}>{content}</PoseSession>
  );
  const handoff = usePoseHandoff<"properties" | "score" | "quality">(
    JSON.stringify([job.id, record, posePlan(frame).key]),
  );
  function selectPose(poseRecord: number) {
    setDiagnostic(null);
    setComparison(null);
    setRecord(poseRecord);
    handoff.clear();
  }
  const next = handoff.value?.action;
  const nextInput = handoff.value?.selection.reference;
  if (nextInput && next)
    return wrap(
      <ResearchHandoff
        language={language}
        onBack={handoff.clear}
        capability={
          next === "properties"
            ? "properties"
            : next === "quality"
              ? "posebusters.check"
              : `gnina.${next}`
        }
      >
        {next === "properties" ? (
          <PropertyForm
            language={language}
            initialFile={nextInput.asset_id}
            scientificInput={nextInput}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        ) : next === "quality" ? (
          <QualityForm
            language={language}
            initialMolecule={nextInput}
            initialProtein={
              handoff.value?.selection.receptor ?? pairedReceptor ?? null
            }
            onCreated={() =>
              setMessage(zh ? "质控任务已创建。" : "Quality task created.")
            }
          />
        ) : (
          <DockingForm
            mode={next}
            language={language}
            initialReceptor={
              handoff.value?.selection.receptor ?? pairedReceptor ?? null
            }
            initialLigand={nextInput}
            initialBox={
              result.search?.kind === "box" ? result.search.box : null
            }
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        )}
      </ResearchHandoff>,
    );
  const interpretation = (
    <details className="pose-result-interpretation">
      <summary>
        {result.mode === "dock"
          ? zh
            ? "评分与搜索范围"
            : "Scores and search scope"
          : zh
            ? "评分说明"
            : "Score interpretation"}
      </summary>
      <p className="field-help">
        {zh
          ? "经验评分用于同一方法下比较候选，不是实测亲和力。化学与坐标检查通过也不等于结合模式已被实验确认。"
          : "Empirical scores compare candidates within the same method; they are not measured affinity. Chemical and coordinate checks do not establish experimental pose validity."}
      </p>
      {result.mode === "dock" && (
        <p className="field-help">
          {searchNotice(language, result.search_report)}
        </p>
      )}
    </details>
  );
  return wrap(
    <section
      className="docking-results spatial-review"
      aria-label={zh ? "结合模式与下一步" : "Binding poses and next steps"}
    >
      <ReceptorRefinementSummary
        jobId={job.id}
        result={result}
        language={language}
      />
      {!qualified.length && interpretation}
      <StructureWorkbench
        toolbar={
          qualified.length > 0 && (
            <CandidateReviewBar
              label={zh ? "姿势预览选择" : "Pose preview selection"}
              caption={zh ? "姿势" : "Pose"}
              candidates={qualified.map((pose) => ({
                id: pose.record,
                label: (zh ? "预览姿势 " : "Preview pose ") + (pose.record + 1),
                short: pose.record + 1,
              }))}
              selected={inspectingPose ? selected?.record : undefined}
              language={language}
              onSelect={selectPose}
            />
          )
        }
        preview={
          <div
            className="result-inspector"
            ref={posePreview}
            tabIndex={-1}
            role="group"
            aria-label={zh ? "结合姿势预览" : "Binding pose preview"}
          >
            {compared.length === 2 ? (
              <PoseComparison
                jobId={job.id}
                result={result}
                poses={compared}
                language={language}
                activation={comparison?.activation ?? 0}
                onClose={() => {
                  comparisonReturn.current = "table";
                  setComparison(null);
                }}
                onInspect={(pose) => {
                  comparisonReturn.current = "preview";
                  selectPose(pose.record);
                }}
              />
            ) : (
              <>
                {diagnostic && (
                  <>
                    <p className="field-help">
                      {zh
                        ? "仅供检查的规范化重原子坐标，不进入合格候选或自动复用。"
                        : "Normalized heavy-atom coordinates for inspection only, excluded from qualified candidates and automatic handoff."}
                    </p>
                    <StructureViewer
                      key={diagnostic}
                      urls={[
                        artifactUrl(job.id, result.receptor_artifact),
                        artifactUrl(job.id, diagnostic),
                      ]}
                      language={language}
                      focusModel={1}
                    />
                  </>
                )}
                {result.poses.length === 0 && (
                  <p role="status">
                    {zh ? "没有返回姿势" : "No poses returned"}
                  </p>
                )}
                {selected?.artifact && (
                  <>
                    <MolecularPreview
                      key={selected.artifact}
                      label={(zh ? "姿势 " : "Pose ") + (selected.record + 1)}
                      source={{ url: artifactUrl(job.id, selected.artifact) }}
                      defaultView="3d"
                      nativeScore={nativeScore}
                      urls={[
                        artifactUrl(job.id, result.receptor_artifact),
                        artifactUrl(job.id, selected.artifact),
                      ]}
                      language={language}
                      focusModel={1}
                    />
                    {selected.mapping_status ===
                      "ambiguous_reconfirm_selections" && (
                      <p className="field-help" role="note">
                        <strong>
                          {zh ? "重选原子区域" : "Reselect atom regions"}
                        </strong>
                        {zh
                          ? "：如需限定原子区域，请在当前姿势上重新选择。"
                          : ": select atoms on this pose before adding region constraints."}
                      </p>
                    )}
                    <PoseStudyInput original={version} language={language}>
                      {(selection, waiting) =>
                        selection ? (
                          <div className="editor-toolbar">
                            {(["properties", "score", "quality"] as const).map(
                              (v, n) => (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  key={v}
                                  disabled={
                                    !selection.ready ||
                                    ((v === "score" || v === "quality") &&
                                      ((selection.displayed &&
                                        selection.receptor === null) ||
                                        (!selection.displayed &&
                                          !pairedReceptor)))
                                  }
                                  onClick={() => {
                                    handoff.open(v, {
                                      ...selection,
                                      receptor: selection.displayed
                                        ? selection.receptor
                                        : pairedReceptor,
                                    });
                                  }}
                                >
                                  {
                                    (zh
                                      ? ["计算性质", "重新评分", "检查姿势质量"]
                                      : [
                                          "Calculate properties",
                                          "Rescore",
                                          "Check pose quality",
                                        ])[n]
                                  }
                                </button>
                              ),
                            )}
                          </div>
                        ) : (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={assets.busy || waiting}
                            onClick={() => void assets.refresh()}
                          >
                            {zh
                              ? "登记并读取这个姿势"
                              : "Register and load this pose"}
                          </button>
                        )
                      }
                    </PoseStudyInput>
                  </>
                )}
              </>
            )}
          </div>
        }
      >
        <div className="docking-result-details" ref={poseDetails}>
          {qualified.length > 0 && (
            <DockingPoseSummary
              jobId={job.id}
              pose={inspectingPose ? selected : undefined}
              nativeScore={nativeScore}
              language={language}
            >
              {interpretation}
            </DockingPoseSummary>
          )}
          <PoseTable
            key={job.id}
            result={result}
            language={language}
            selected={record}
            onSelect={(pose) => selectPose(pose.record)}
            onDiagnostic={(artifact) => {
              setRecord(null);
              setComparison(null);
              handoff.clear();
              setDiagnostic(artifact);
            }}
            onCompare={(poses, trigger) => {
              if (
                poses.length !== 2 ||
                poses.some((pose) => !pose.valid || !pose.artifact)
              )
                return;
              setDiagnostic(null);
              handoff.clear();
              launcher.current = trigger;
              setComparison((previous) => ({
                jobId: job.id,
                records: poses.map((pose) => pose.record),
                activation: (previous?.activation ?? 0) + 1,
              }));
            }}
          />
          <DockingResultsEvidence
            jobId={job.id}
            result={result}
            pose={inspectingPose ? selected : undefined}
            language={language}
          />
          <ReferenceComparison result={result} language={language} />
          <PoseViolations poses={result.poses} language={language} />
        </div>
      </StructureWorkbench>
      {receptorTarget && !pairedReceptor && (
        <p role="status">
          {zh
            ? "后续姿势研究需要读取同次优化的蛋白。"
            : "Further pose studies need the receptor from this same refinement."}{" "}
          <button
            type="button"
            className="text-button"
            disabled={assets.busy}
            onClick={() => void assets.refresh()}
          >
            {zh ? "读取成对蛋白" : "Load paired receptor"}
          </button>
        </p>
      )}
      {assets.busy && (
        <button type="button" className="text-button" onClick={assets.cancel}>
          {zh ? "取消读取" : "Cancel loading"}
        </button>
      )}
      {assets.error && (
        <div role="alert">
          <p>{poseAssetMessage(assets.error, zh)}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void assets.retry()}
          >
            {zh ? "重新读取保存的材料" : "Retry saved materials"}
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <details>
        <summary>{zh ? "完整姿势集" : "Complete pose set"}</summary>
        <p>
          {zh
            ? "同一任务的全部候选姿势，可用于进一步筛选和比较。"
            : "All candidate poses from this task, available for further selection and comparison."}
        </p>
        <a href={artifactUrl(job.id, result.pose_artifact)} download>
          {zh ? "完整姿势集" : "Complete pose set"}
        </a>
      </details>
    </section>,
  );
}
