import { useState, type ReactNode } from "react";
import { GeneratedCandidates } from "./GeneratedCandidates";
import { artifactUrl } from "../api";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { PoseSession } from "../viewer/PoseSession";
import { PoseStudyInput } from "../viewer/PoseStudyInput";
import { usePoseHandoff } from "../viewer/usePoseHandoff";
import { posePlan } from "../viewer/pose-plan";
import type { OperationResult } from "../operations/types";
import { CoreVerification } from "./CoreVerification";
import { isResearchFile } from "../presentation/research-files";
import { StructureViewer } from "../viewer/StructureViewer";
import { GenerationRejections } from "./GenerationRejections";
import { isDesign } from "./types";
import { ScientificDetails } from "./ScientificDetails";
import { ResearchHandoff } from "../guided/ResearchHandoff";
import { DesignInputContext } from "./DesignInputContext";
import { generatedMetrics } from "./generated-metrics";
import { CandidateFollowup, type CandidateAction } from "./CandidateFollowup";
import { GenerationSummary } from "./GenerationSummary";
import { useGeneratedRecords } from "./useGeneratedRecords";
import { optimizationReview } from "./optimization-model";
import { OptimizationSummary } from "./OptimizationSummary";

export function DiffResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh";
  const [message, setMessage] = useState("");
  const targetArtifact =
    typeof data.molecule_artifact === "string"
      ? data.molecule_artifact
      : typeof data.artifact === "string"
        ? data.artifact
        : null;
  const mode =
    job.request.operation === "diffsbdd" ? job.request.payload.mode : "";
  const designing = isDesign(mode);
  const options =
    job.request.operation === "diffsbdd" ? job.request.payload.options : null;
  const objective =
    options && typeof options === "object" && "objective" in options
      ? options.objective
      : undefined;
  const optimization =
    mode === "optimize" ? optimizationReview(data.report, objective) : null;
  const candidates = useGeneratedRecords(job.id, targetArtifact, data);
  const records = candidates.records,
    selectedRecord = candidates.selected;
  const selected = selectedRecord?.object ?? null;
  const error =
    candidates.error === "prepare"
      ? zh
        ? "研究材料暂未准备好，请重试准备后续研究材料。原始结果已保留。"
        : "Research inputs could not be prepared. Retry Prepare for follow-up; original results are preserved."
      : candidates.error
        ? zh
          ? "分子结果与原始记录无法核对，请检查原始文件。"
          : candidates.error
        : "";
  const names = [
    "protein_artifact",
    "pocket_artifact",
    "molecule_artifact",
    "report_artifact",
    "reference_artifact",
    "artifact",
  ].flatMap((key) =>
    typeof data[key] === "string" &&
    isResearchFile(data[key] as string) &&
    !(key === "molecule_artifact" && data.valid === 0)
      ? [{ key, name: data[key] as string }]
      : [],
  );
  const fileLabels: Record<string, [string, string]> = {
    protein_artifact: ["受体结构", "Receptor structure"],
    pocket_artifact: ["口袋结构", "Pocket structure"],
    molecule_artifact: ["分子结构", "Molecule structures"],
    report_artifact: ["分析报告", "Analysis report"],
    reference_artifact: ["参考分子", "Reference molecule"],
    artifact: ["结果文件", "Result file"],
  };
  const protein =
    typeof data.protein_artifact === "string" ? data.protein_artifact : null;
  const currentUrl =
    targetArtifact &&
    selectedRecord &&
    (selectedRecord.object?.reference.conformer ?? 0) === 0
      ? artifactUrl(job.id, targetArtifact)
      : null;
  const frame = {
    urls: currentUrl
      ? designing && protein
        ? [artifactUrl(job.id, protein), currentUrl]
        : [currentUrl]
      : [],
    records: currentUrl
      ? designing && protein
        ? [0, selectedRecord!.record]
        : [selectedRecord!.record]
      : undefined,
    molecularSource: currentUrl
      ? { url: currentUrl, record: selectedRecord!.record }
      : undefined,
  };
  const wrap = (content: ReactNode) => (
    <PoseSession frame={frame}>{content}</PoseSession>
  );
  const handoff = usePoseHandoff<CandidateAction>(
    JSON.stringify([
      job.id,
      targetArtifact,
      selectedRecord?.record,
      posePlan(frame).key,
    ]),
  );
  const action = handoff.value?.action;
  const nextInput = handoff.value?.selection.reference;
  if (nextInput && action)
    return wrap(
      <ResearchHandoff language={language} onBack={handoff.clear}>
        <CandidateFollowup
          key={(nextInput.version_id ?? nextInput.asset_id) + action}
          action={action}
          language={language}
          molecule={nextInput}
          protein={
            handoff.value?.selection.receptor ??
            (job.request.operation === "diffsbdd"
              ? (job.request.payload.protein as MoleculeRef)
              : null)
          }
          onCreated={() =>
            setMessage(
              zh
                ? "新任务已创建，可在任务记录中查看。"
                : "New task created; view it in Task history.",
            )
          }
        />
      </ResearchHandoff>,
    );
  return wrap(
    <section
      aria-label={
        zh ? "DiffSBDD 结果与下一步" : "DiffSBDD results and next steps"
      }
    >
      {designing && mode !== "optimize" && (
        <p className="field-help">
          {zh
            ? "生成数量不代表活性或亲和力；请继续比较性质和结合姿势。"
            : "Generated counts do not establish activity or affinity; compare properties and binding poses next."}
        </p>
      )}
      <ScientificDetails job={job} data={data} language={language} />
      {optimization && (
        <OptimizationSummary
          review={optimization}
          language={language}
          canSelect={
            optimization.state === "ready" &&
            records.some(
              (row) => row.record === optimization.data.bestGenerated?.record,
            )
          }
          onSelect={(record) => {
            const row = records.find((value) => value.record === record);
            if (row) {
              candidates.select(row);
              handoff.clear();
            }
          }}
        />
      )}
      {designing && (
        <GenerationSummary report={data.report} language={language} />
      )}
      {typeof data.valid === "number" && optimization?.state !== "ready" && (
        <p>
          {data.core_verification
            ? zh
              ? "通过固定区域复核 / 采样尝试"
              : "Fixed-region checks passed / sampling attempts"
            : zh
              ? "可读取结构 / 生成尝试"
              : "Readable structures / generation attempts"}
          : {data.valid} / {String(data.attempted)}
        </p>
      )}
      {data.core_verification && (
        <CoreVerification
          data={data.core_verification}
          jobId={job.id}
          language={language}
        />
      )}
      {data.valid === 0 && (
        <p className="notice" role="status">
          {zh
            ? "此次没有得到符合要求的候选。请检查起始分子和固定区域，或调整生成方案后重新尝试。"
            : "No qualified candidates were returned. Review the starting molecule and fixed region, or adjust the design settings before retrying."}
        </p>
      )}
      {data.valid === 0 && (
        <GenerationRejections
          report={data.report}
          verification={data.core_verification}
          language={language}
        />
      )}
      {designing && data.valid === 0 && (
        <DesignInputContext job={job} language={language} />
      )}
      {names.length > 0 && (
        <ul>
          {names.map((v) => (
            <li key={v.key}>
              <a
                className="research-download"
                href={artifactUrl(job.id, v.name)}
                title={v.name.split("/").at(-1)}
                download
              >
                {fileLabels[v.key]?.[zh ? 0 : 1] ?? v.name.split("/").at(-1)} ·{" "}
                {v.name.split(".").at(-1)?.toUpperCase()}
              </a>
            </li>
          ))}
        </ul>
      )}
      {protein && mode !== "pocket" && (
        <details>
          <summary>{zh ? "查看受体结构" : "View receptor structure"}</summary>
          <StructureViewer
            urls={[artifactUrl(job.id, protein)]}
            language={language}
          />
        </details>
      )}
      {records.length > 0 && targetArtifact && (
        <>
          <GeneratedCandidates
            records={records}
            generated={designing}
            url={artifactUrl(job.id, targetArtifact)}
            selected={selectedRecord}
            language={language}
            verification={data.core_verification}
            proteinUrl={
              designing && protein ? artifactUrl(job.id, protein) : undefined
            }
            metrics={designing ? generatedMetrics(data.report) : null}
            optimization={
              optimization?.state === "ready" ? optimization.data : undefined
            }
            onSelect={(value) => {
              candidates.select(value);
              handoff.clear();
            }}
          >
            {designing && selectedRecord && !selected && (
              <button
                type="button"
                className="secondary-button"
                disabled={candidates.preparing}
                onClick={() => void candidates.prepare()}
              >
                {candidates.preparing
                  ? zh
                    ? "正在准备研究材料…"
                    : "Preparing research inputs…"
                  : zh
                    ? "准备后续研究材料"
                    : "Prepare for follow-up"}
              </button>
            )}
            <PoseStudyInput original={selected} language={language}>
              {(selection) => (
                <>
                  {selection &&
                    job.request.operation === "diffsbdd" &&
                    "protein" in job.request.payload && (
                      <label className="field">
                        {zh
                          ? "下一轮想怎样设计？"
                          : "What should the next design round do?"}
                        <select
                          value=""
                          disabled={!selection.ready}
                          onChange={(e) => {
                            const value = (
                              ["inpaint", "diversify", "optimize"] as const
                            ).find((v) => v === e.target.value);
                            if (value) handoff.open(value, selection);
                          }}
                        >
                          <option value="">—</option>
                          <option value="inpaint">
                            {zh
                              ? "保留核心，局部重设计"
                              : "Keep a core and redesign locally"}
                          </option>
                          <option value="diversify">
                            {zh
                              ? "围绕当前分子多样化"
                              : "Diversify this molecule"}
                          </option>
                          <option value="optimize">
                            {zh ? "按 QED/SA 优化" : "Optimize QED/SA"}
                          </option>
                        </select>
                      </label>
                    )}
                  {selection && (
                    <div className="editor-toolbar">
                      {designing && (
                        <button
                          type="button"
                          disabled={!selection.ready}
                          onClick={() => handoff.open("quality", selection)}
                        >
                          {zh
                            ? "检查这个候选的姿势质量"
                            : "Check this candidate's pose quality"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!selection.ready}
                        onClick={() => handoff.open("properties", selection)}
                      >
                        {zh
                          ? "计算这个候选的性质"
                          : "Calculate this candidate's properties"}
                      </button>
                      <button
                        type="button"
                        disabled={!selection.ready}
                        onClick={() => handoff.open("export", selection)}
                      >
                        {zh ? "导出这个候选" : "Export this candidate"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </PoseStudyInput>
          </GeneratedCandidates>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>,
  );
}
