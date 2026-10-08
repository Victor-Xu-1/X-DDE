import { useEffect, useState } from "react";
import { api, artifactUrl } from "../api";
import type { Job, Language, Prediction } from "../types";
import { PropertyResults } from "./PropertyResults";
import { PreparedInputResults } from "./PreparedInputResults";
import { QualityResults } from "../quality/QualityResults";
import { AdmetResults } from "../admet/AdmetResults";
import { HumanizationResults } from "../humanization/HumanizationResults";
import type { HumanizationResult } from "../humanization/types";
import type { AdmetResult } from "../admet/types";
import type { PoseQualityResult } from "../quality/types";
import { AntibodyNumberResults } from "../antibodies/AntibodyNumberResults";
import type { AntibodyNumberResult } from "../antibodies/types";
import { LibraryScreenResults } from "../chemistry/LibraryScreenResults";
import type { LibraryScreenResult } from "../chemistry/screen-types";
import { ClusterResults } from "../poses/ClusterResults";
import type { PoseClusterResult } from "../poses/cluster-types";
import { SurfaceResults } from "../receptors/SurfaceResults";
import { ChannelResults } from "../space/ChannelResults";
import type { ChannelResult } from "../space/types";
import type { SurfaceResult } from "../receptors/surface-types";
import { StructurePrepareResults } from "../receptors/StructurePrepareResults";
import type { StructurePrepareResult } from "../receptors/preparation-types";
import { PocketResults } from "../pockets/PocketResults";
import type { PocketResult } from "../pockets/types";
import { DockingResults } from "../docking/DockingResults";
import type { DockingResult } from "../docking/types";
import { ReceptorResults } from "../receptors/ReceptorResults";
import type { ReceptorResult } from "../receptors/types";
import {
  ReferenceImportResults,
  type ReferenceImportResult,
} from "../discovery/ReferenceImportResults";
import { TargetResearchResults } from "../discovery/TargetResearchResults";
import type { TargetResearchResult } from "../discovery/types";
import { StateResults } from "../chemistry/StateResults";
import type { StateResult } from "../chemistry/types";
import { DiffResults } from "../diffsbdd/DiffResults";
import type { OperationResult } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { MinimizedPoseResults } from "../viewer/MinimizedPoseResults";
import { HarnessResults } from "./HarnessResults";
import { sequenceCandidateResult } from "./candidate-structures";
import { researchError } from "../presentation/research-content";
import { ScientificResults } from "../integrations/ScientificResults";
import type { NativeResult } from "../integrations/types";
import { nativeOperations } from "../integrations/operations";
import { DatasetResults } from "../datasets/DatasetResults";
import { datasetOperations, type DatasetResult } from "../datasets/types";
import "../datasets/datasets.css";

export { ResultTree } from "./StructuredResults";

export function OperationResults({
  job,
  language,
  onDraft,
  onCreated,
}: {
  job: Job;
  language: Language;
  onDraft?(request: Prediction): void;
  onCreated?(job: Job): void;
}) {
  const zh = language === "zh";
  const [response, setResponse] = useState<{
    jobId: string;
    data: OperationResult | null;
    error: string;
  } | null>(null);
  const data = response?.jobId === job.id ? response.data : null;
  const error = response?.jobId === job.id ? response.error : "";
  const supported = [
    ...datasetOperations,
    ...nativeOperations,
    "antibody_humanize",
    "admet_predict",
    "pose_quality",
    "pose_cluster",
    "antibody_number",
    "library_screen",
    "structure_prepare",
    "surface_exposure",
    "channel_analysis",
    "pocket_search",
    "reference_import",
    "target_research",
    "docking",
    "diffsbdd",
    "molecular_states",
    "molecule_minimize",
    "receptor_ensemble",
    "properties",
    "inspect",
    "json",
    "resources",
    "harness",
    "msa",
    "mt",
    "prep",
  ].includes(job.request.operation ?? "");
  useEffect(() => {
    setResponse(null);
    const controller = new AbortController();
    if (supported)
      void api
        .result(job.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setResponse({ jobId: job.id, data: value, error: "" });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setResponse({ jobId: job.id, data: null, error: String(e) });
        });
    return () => controller.abort();
  }, [job.id, supported]);
  if (!supported) return null;
  if (error)
    return (
      <p role="alert" className="error-box">
        {researchError(error, zh)}
      </p>
    );
  if (!data)
    return <p role="status">{zh ? "正在读取结果…" : "Loading results…"}</p>;
  if (
    datasetOperations.includes(
      job.request.operation as (typeof datasetOperations)[number],
    )
  )
    return (
      <DatasetResults
        job={job}
        result={data as unknown as DatasetResult}
        language={language}
        onCreated={onCreated}
      />
    );
  if (nativeOperations.some((operation) => operation === job.request.operation))
    return (
      <ScientificResults
        key={job.id}
        job={job}
        result={data as unknown as NativeResult}
        language={language}
      />
    );
  return (
    <section
      className="operation-results"
      aria-label={zh ? "计算结果" : "Computed results"}
    >
      {job.request.operation === "antibody_humanize" && (
        <HumanizationResults
          job={job}
          result={data as unknown as HumanizationResult}
          language={language}
          onDraft={onDraft}
          onCreated={onCreated}
        />
      )}
      {job.request.operation === "admet_predict" && (
        <AdmetResults
          job={job}
          result={data as unknown as AdmetResult}
          language={language}
          onCreated={onCreated}
        />
      )}
      {job.request.operation === "pose_cluster" && (
        <ClusterResults
          job={job}
          result={data as unknown as PoseClusterResult}
          language={language}
        />
      )}
      {job.request.operation === "pose_quality" && (
        <QualityResults
          job={job}
          result={data as unknown as PoseQualityResult}
          language={language}
        />
      )}
      {job.request.operation === "antibody_number" && (
        <AntibodyNumberResults
          job={job}
          result={data as unknown as AntibodyNumberResult}
          language={language}
          onDraft={onDraft}
        />
      )}
      {job.request.operation === "library_screen" && (
        <LibraryScreenResults
          job={job}
          result={data as unknown as LibraryScreenResult}
          language={language}
          onCreated={onCreated}
        />
      )}
      {job.request.operation === "channel_analysis" && (
        <ChannelResults
          job={job}
          result={data as unknown as ChannelResult}
          language={language}
        />
      )}
      {job.request.operation === "surface_exposure" && (
        <SurfaceResults
          job={job}
          result={data as unknown as SurfaceResult}
          language={language}
        />
      )}
      {job.request.operation === "structure_prepare" && (
        <StructurePrepareResults
          job={job}
          result={data as unknown as StructurePrepareResult}
          language={language}
          onCreated={onCreated}
        />
      )}
      {job.request.operation === "reference_import" && (
        <ReferenceImportResults
          job={job}
          result={data as unknown as ReferenceImportResult}
          language={language}
          onCreated={onCreated}
        />
      )}
      {job.request.operation === "target_research" && (
        <TargetResearchResults
          job={job}
          result={data as unknown as TargetResearchResult}
          language={language}
          onDraft={onDraft}
          onCreated={onCreated}
        />
      )}
      {data.notes &&
        !["docking", "pocket_search"].includes(job.request.operation ?? "") && (
          <details className="result-method-notes">
            <summary>{zh ? "方法与结果范围" : "Method & result scope"}</summary>
            <p>{data.notes}</p>
          </details>
        )}
      {data.molecules && (
        <p role={data.molecules.some((m) => m.available) ? "status" : "alert"}>
          {zh ? "成功计算" : "Calculated"}{" "}
          {data.molecules.filter((m) => m.available).length} /{" "}
          {data.molecules.length}{" "}
          {zh
            ? "个分子；不可解析的记录保留错误原因。"
            : "molecules; invalid records retain their error details."}
        </p>
      )}
      {data.molecules && (
        <PropertyResults
          job={job}
          molecules={data.molecules}
          language={language}
          onDraft={onDraft}
        />
      )}
      {typeof data.structure === "string" &&
        !sequenceCandidateResult(job, data) && (
          <section aria-label={zh ? "输入结构" : "Input structure"}>
            {job.request.operation === "inspect" && (
              <h3>
                {zh
                  ? "输入结构预览（非预测结果）"
                  : "Input structure preview (not a prediction)"}
              </h3>
            )}
            <StructureViewer
              urls={[artifactUrl(job.id, data.structure)]}
              language={language}
              comparison={false}
              focusResidue={null}
            />
          </section>
        )}
      {Array.isArray(data.structures) &&
        !sequenceCandidateResult(job, data) &&
        data.structures
          .filter((v): v is string => typeof v === "string")
          .map((name, i) => (
            <details key={name}>
              <summary>
                {zh ? "三维结构" : "3D structure"} {i + 1}
              </summary>
              <StructureViewer
                urls={[artifactUrl(job.id, name)]}
                language={language}
              />
            </details>
          ))}
      {job.request.operation === "pocket_search" && (
        <PocketResults
          job={job}
          result={data as unknown as PocketResult}
          language={language}
        />
      )}
      {job.request.operation === "docking" && (
        <DockingResults
          job={job}
          result={data as unknown as DockingResult}
          language={language}
        />
      )}
      {job.request.operation === "receptor_ensemble" && (
        <ReceptorResults
          job={job}
          data={data as unknown as ReceptorResult}
          language={language}
        />
      )}
      {job.request.operation === "molecular_states" && (
        <StateResults
          job={job}
          data={data as unknown as StateResult}
          language={language}
        />
      )}
      {job.request.operation === "molecule_minimize" && (
        <MinimizedPoseResults
          job={job}
          data={
            data as unknown as Parameters<
              typeof MinimizedPoseResults
            >[0]["data"]
          }
          language={language}
        />
      )}
      {job.request.operation === "diffsbdd" && (
        <DiffResults job={job} data={data} language={language} />
      )}
      {job.request.operation === "harness" && (
        <HarnessResults job={job} data={data} language={language} />
      )}
      {data.documents && data.documents.length > 0 && (
        <PreparedInputResults
          job={job}
          documents={data.documents}
          language={language}
        />
      )}
    </section>
  );
}
