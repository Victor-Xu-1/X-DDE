import { ResearchHandoff } from "../guided/ResearchHandoff";
import { poseScore } from "./poseScore";
import { scoreLabel } from "./scoreLabels";
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
    [next, setNext] = useState<"properties" | "score" | "minimize" | null>(
      null,
    ),
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
      <div className="table-scroll">
        <table>
          <caption>GNINA {result.software_version}</caption>
          <thead>
            <tr>
              {(zh
                ? ["姿势", "评分", "原子映射", "状态"]
                : ["Pose", "Scores", "Atom mapping", "Status"]
              ).map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.poses.map((p) => (
              <tr key={p.record}>
                <th>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!p.valid || !p.artifact}
                    aria-pressed={record === p.record}
                    onClick={() => {
                      setDiagnostic(null);
                      setRecord(p.record);
                      setNext(null);
                    }}
                  >
                    {zh ? "姿势" : "Pose"} {p.record + 1}
                  </button>
                  {p.diagnostic_artifact && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setRecord(null);
                        setNext(null);
                        setDiagnostic(p.diagnostic_artifact!);
                      }}
                    >
                      {zh ? "检查不合格姿势" : "Inspect rejected pose"}
                    </button>
                  )}
                </th>
                <td>
                  {p.scores.map((v) => (
                    <span
                      key={v.name}
                      title={
                        zh
                          ? "保留原生方法与单位；不能直接换算成 KD 或 IC50"
                          : "Native method and units; no direct conversion to KD or IC50"
                      }
                    >
                      {scoreLabel(v.name, language)}: {v.value.toFixed(3)}{" "}
                      {v.unit === "model_output"
                        ? zh
                          ? "模型输出"
                          : "model output"
                        : v.unit}{" "}
                    </span>
                  ))}
                </td>
                <td title={p.mapping_status}>
                  {p.mapping_status === "ambiguous_reconfirm_selections"
                    ? zh
                      ? "重选原子区域"
                      : "Reselect atom regions"
                    : p.mapping_status === "unavailable"
                      ? "—"
                      : zh
                        ? "已记录"
                        : "Recorded"}
                </td>
                <td>
                  {p.constraint_checks?.map((c) => (
                    <div key={c.condition_id}>
                      {c.passed
                        ? zh
                          ? "空间条件通过"
                          : "Spatial condition passed"
                        : zh
                          ? "空间条件未通过"
                          : "Spatial condition failed"}{" "}
                      · {c.maximum_excess.toFixed(3)} Å
                    </div>
                  ))}
                  <span className="pose-qualification">
                    {p.valid
                      ? zh
                        ? "可复用候选"
                        : "Reusable candidate"
                      : p.constraint_checks?.some(
                            (c) => c.strength === "hard" && !c.passed,
                          )
                        ? zh
                          ? "已排除：未满足硬空间条件"
                          : "Excluded: hard spatial condition failed"
                        : p.reason}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PoseViolations poses={result.poses} language={language} />
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
          <StructureViewer
            key={selected.artifact}
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
              {(["properties", "score", "minimize"] as const).map((v, n) => (
                <button
                  className="secondary-button"
                  type="button"
                  key={v}
                  onClick={() => setNext(v)}
                >
                  {
                    (zh
                      ? ["计算性质", "重新评分", "局部最小化"]
                      : [
                          "Calculate properties",
                          "Rescore",
                          "Local minimization",
                        ])[n]
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
