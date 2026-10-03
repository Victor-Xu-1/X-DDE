import { useEffect, useState } from "react";
import { api, artifactUrl } from "../api";
import type { Job, Language, Prediction } from "../types";
import { defaults } from "../form-model";
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

export { ResultTree } from "./StructuredResults";
import { ResultTree } from "./StructuredResults";

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
  const [data, setData] = useState<OperationResult | null>(null),
    [error, setError] = useState("");
  const supported = [
    "antibody_humanize",
    "admet_predict",
    "pose_quality",
    "antibody_number",
    "library_screen",
    "structure_prepare",
    "pocket_search",
    "reference_import",
    "target_research",
    "docking",
    "diffsbdd",
    "molecular_states",
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
    setData(null);
    setError("");
    const controller = new AbortController();
    if (supported)
      void api
        .result(job.id, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(String(e));
        });
    return () => controller.abort();
  }, [job.id, supported]);
  if (!supported) return null;
  if (error)
    return (
      <p role="alert" className="error-box">
        {error}
      </p>
    );
  if (!data)
    return <p role="status">{zh ? "正在读取结果…" : "Loading results…"}</p>;
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
        !["docking", "pocket_search"].includes(job.request.operation ?? "") &&
        (job.request.operation === "diffsbdd" ? (
          <details className="result-method-notes">
            <summary>{zh ? "方法与结果范围" : "Method & result scope"}</summary>
            <p>{data.notes}</p>
          </details>
        ) : (
          <p className="notice">
            {zh && job.request.operation === "properties"
              ? "这些是 RDKit 计算描述符。QED 表示类药性，SA 是合成难易度启发式指标；不代表 ADMET 或实验药效。"
              : zh && job.request.operation === "inspect"
                ? "这是原生输入拓扑预览，坐标不是预测结合姿势；残基编号以这份输入为准。"
                : data.notes}
          </p>
        ))}
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
        <div className="table-scroll">
          <table>
            <caption>
              {zh ? "分子性质 · RDKit 计算" : "Molecular properties · RDKit"}
            </caption>
            <thead>
              <tr>
                {[
                  zh ? "分子" : "Molecule",
                  "MW",
                  "LogP",
                  "TPSA",
                  "QED",
                  "SA",
                  "HBD",
                  "HBA",
                  zh ? "可旋转键" : "Rotatable bonds",
                  ...(onDraft ? [zh ? "下一步" : "Next step"] : []),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.molecules.map((m, i) => (
                <tr key={i}>
                  <th scope="row">
                    <span>
                      {zh ? "分子" : "Molecule"} {i + 1}
                    </span>
                    <small
                      className="result-smiles"
                      title={m.smiles ?? m.input}
                    >
                      {m.smiles ?? m.input}
                    </small>
                  </th>
                  {m.available ? (
                    [
                      m.mw,
                      m.logp,
                      m.tpsa,
                      m.qed,
                      m.sa,
                      m.hbd,
                      m.hba,
                      m.rotatable_bonds,
                    ].map((x, j) => (
                      <td key={j}>{x == null ? "—" : Number(x.toFixed(3))}</td>
                    ))
                  ) : (
                    <td colSpan={8} role="status">
                      {m.reason}
                    </td>
                  )}
                  {onDraft && (
                    <td>
                      {m.available && m.smiles && (
                        <button
                          type="button"
                          onClick={() =>
                            onDraft({
                              name: (job.request.name + " · " + (i + 1)).slice(
                                0,
                                80,
                              ),
                              components: [
                                { kind: "ligand", value: m.smiles!, count: 1 },
                              ],
                              parameters: { ...defaults, model: "standard" },
                              project_id: job.request.project_id,
                            })
                          }
                        >
                          {zh ? "用此分子预测结构" : "Predict this molecule"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.structure && (
        <StructureViewer
          urls={[artifactUrl(job.id, data.structure)]}
          language={language}
          comparison={false}
          focusResidue={null}
        />
      )}
      {Array.isArray(data.structures) &&
        data.structures
          .filter((v): v is string => typeof v === "string")
          .map((name) => (
            <details key={name}>
              <summary>{name}</summary>
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
      {job.request.operation === "diffsbdd" && (
        <DiffResults job={job} data={data} language={language} />
      )}
      {job.request.operation === "harness" && (
        <ResultTree value={data.result ?? data} zh={zh} />
      )}
      {data.documents && (
        <p>
          {zh
            ? "转换后的输入文件已列在下方，可在工具中心导入后预测。"
            : "Converted input files are listed below. Import them from the tool center to predict."}
        </p>
      )}
    </section>
  );
}
