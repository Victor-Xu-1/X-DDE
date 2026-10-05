import { ResearchHandoff } from "../guided/ResearchHandoff";
import { poseScore } from "./poseScore";
import { PoseTable } from "./PoseTable";
import { MolecularPreview } from "../presentation/MolecularPreview";
import { PoseViolations } from "./PoseViolations";
import "./results.css";
import { useState } from "react";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import { StructureViewer } from "../viewer/StructureViewer";
import { PropertyForm } from "../operations/PropertyForm";
import { DockingForm } from "./DockingForm";
import { usePoseAssets } from "./usePoseAssets";
import type { DockingResult } from "./types";
export function DockingResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: DockingResult;
  language: Language;
}) {
  const zh = language === "zh",
    assets = usePoseAssets(job.id);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [record, setRecord] = useState<number | null>(
      () => result.poses.find((p) => p.valid && p.artifact)?.record ?? null,
    ),
    [next, setNext] = useState<"properties" | "score" | null>(null),
    [message, setMessage] = useState("");
  const selected = result.poses.find(
    (v) => v.record === record && v.valid && v.artifact,
  );
  const version = assets.versions.find(
    (v) => v.kind === "molecule" && v.label === selected?.artifact,
  );
  if (version && next)
    return (
      <ResearchHandoff language={language} onBack={() => setNext(null)}>
        {next === "properties" ? (
          <PropertyForm
            language={language}
            initialFile={version.reference.asset_id}
            scientificInput={version.reference}
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        ) : (
          <DockingForm
            mode={next}
            language={language}
            initialReceptor={result.receptor}
            initialLigand={version.reference}
            initialBox={
              result.search?.kind === "box" ? result.search.box : null
            }
            onCreated={() =>
              setMessage(zh ? "新任务已创建。" : "New task created.")
            }
          />
        )}
      </ResearchHandoff>
    );
  return (
    <section
      className="docking-results"
      aria-label={zh ? "结合模式与下一步" : "Binding poses and next steps"}
    >
      <p className="field-help">
        {zh
          ? "经验评分用于同一方法下比较候选，不是实测亲和力。化学与坐标检查通过也不等于结合模式已被实验确认。"
          : "Empirical scores compare candidates within the same method; they are not measured affinity. Chemical and coordinate checks do not establish experimental pose validity."}
      </p>
      <div className="result-master-detail">
        <div>
          <PoseTable
            jobId={job.id}
            result={result}
            language={language}
            selected={record}
            onSelect={(pose) => {
              setDiagnostic(null);
              setRecord(pose.record);
              setNext(null);
            }}
            onDiagnostic={(artifact) => {
              setRecord(null);
              setNext(null);
              setDiagnostic(artifact);
            }}
          />
          <PoseViolations poses={result.poses} language={language} />
        </div>
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
              {version ? (
                <div className="editor-toolbar">
                  {(["properties", "score"] as const).map((v, n) => (
                    <button
                      className="secondary-button"
                      type="button"
                      key={v}
                      onClick={() => setNext(v)}
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
                  disabled={assets.busy}
                  onClick={() => void assets.refresh()}
                >
                  {zh ? "登记并读取这个姿势" : "Register and load this pose"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {assets.error && <p role="alert">{assets.error}</p>}
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
    </section>
  );
}
