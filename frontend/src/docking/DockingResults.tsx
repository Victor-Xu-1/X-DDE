import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { poseScore } from "./poseScore";
import { PoseTable } from "./PoseTable";
import { ReferenceComparison } from "./ReferenceComparison";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { PoseViolations } from "./PoseViolations";
import "./results.css";
import { useState, type ReactNode } from "react";
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
export function DockingResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: DockingResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [record, setRecord] = useState<number | null>(
      () => result.poses.find((p) => p.valid && p.artifact)?.record ?? null,
    ),
    [message, setMessage] = useState("");
  const selected = result.poses.find(
    (v) => v.record === record && v.valid && v.artifact,
  );
  const target: PoseAssetTarget | null = selected?.artifact
    ? { name: selected.artifact, kind: "molecule", record: 0 }
    : null;
  const assets = usePoseAssets(job.id, target ? [target] : []);
  const version = target ? assets.object(target) : undefined;
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
    nativeScore: selected ? poseScore(result, selected) : undefined,
  };
  const wrap = (content: ReactNode) => (
    <PoseSession frame={frame}>{content}</PoseSession>
  );
  const handoff = usePoseHandoff<"properties" | "score">(
    JSON.stringify([job.id, record, posePlan(frame).key]),
  );
  const next = handoff.value?.action;
  const nextInput = handoff.value?.selection.reference;
  if (nextInput && next)
    return wrap(
      <ResearchHandoff language={language} onBack={handoff.clear}>
        {next === "properties" ? (
          <PropertyForm
            language={language}
            initialFile={nextInput.asset_id}
            scientificInput={nextInput}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        ) : (
          <DockingForm
            mode={next}
            language={language}
            initialReceptor={
              handoff.value?.selection.receptor ?? result.receptor
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
  return wrap(
    <section
      className="docking-results"
      aria-label={zh ? "结合模式与下一步" : "Binding poses and next steps"}
    >
      <p className="field-help">
        {zh
          ? "经验评分用于同一方法下比较候选，不是实测亲和力。化学与坐标检查通过也不等于结合模式已被实验确认。"
          : "Empirical scores compare candidates within the same method; they are not measured affinity. Chemical and coordinate checks do not establish experimental pose validity."}
      </p>
      <StructureWorkbench
        preview={
          <div className="result-inspector">
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
              <p role="status">{zh ? "没有返回姿势" : "No poses returned"}</p>
            )}
            {selected?.artifact && (
              <>
                <MolecularPreview
                  key={selected.artifact}
                  label={(zh ? "姿势 " : "Pose ") + (selected.record + 1)}
                  source={{ url: artifactUrl(job.id, selected.artifact) }}
                  defaultView="3d"
                  nativeScore={poseScore(result, selected)}
                  urls={[
                    artifactUrl(job.id, result.receptor_artifact),
                    artifactUrl(job.id, selected.artifact),
                  ]}
                  language={language}
                  focusModel={1}
                />
                <a href={artifactUrl(job.id, selected.artifact)} download>
                  {zh ? "下载所选姿势 SDF" : "Download selected pose SDF"}
                </a>
                <PoseStudyInput original={version} language={language}>
                  {(selection, waiting) =>
                    selection ? (
                      <div className="editor-toolbar">
                        {(["properties", "score"] as const).map((v, n) => (
                          <button
                            className="secondary-button"
                            type="button"
                            key={v}
                            disabled={
                              !selection.ready ||
                              (v === "score" &&
                                selection.displayed &&
                                selection.receptor === null)
                            }
                            onClick={() => {
                              handoff.open(v, selection);
                            }}
                          >
                            {
                              (zh
                                ? ["计算性质", "重新评分"]
                                : ["Calculate properties", "Rescore"])[n]
                            }
                          </button>
                        ))}
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
          </div>
        }
      >
        <div>
          <ReferenceComparison result={result} language={language} />
          <PoseTable
            result={result}
            language={language}
            selected={record}
            onSelect={(pose) => {
              setDiagnostic(null);
              setRecord(pose.record);
              handoff.clear();
            }}
            onDiagnostic={(artifact) => {
              setRecord(null);
              handoff.clear();
              setDiagnostic(artifact);
            }}
          />
          <PoseViolations poses={result.poses} language={language} />
        </div>
      </StructureWorkbench>
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
