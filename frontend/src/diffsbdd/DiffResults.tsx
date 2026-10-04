import { useEffect, useState } from "react";
import {
  GeneratedCandidates,
  type GeneratedRecord,
} from "./GeneratedCandidates";
import { artifactUrl, request } from "../api";
import { artifactInfo } from "../presentation/artifact-digest";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { OperationResult } from "../operations/types";
import { DiffForm } from "./DiffForm";
import { CoreVerification } from "./CoreVerification";
import { PropertyForm } from "../operations/PropertyForm";
import { isResearchFile } from "../presentation/research-files";
import { StructureViewer } from "../viewer/StructureViewer";
import { ResultTree } from "../operations/StructuredResults";
import { isDesign } from "./types";
import { ScientificDetails } from "./ScientificDetails";
import { ResearchHandoff } from "../guided/ResearchHandoff";

export function DiffResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh",
    [error, setError] = useState("");
  const [records, setRecords] = useState<GeneratedRecord[]>([]),
    [selectedRecord, setSelectedRecord] = useState<GeneratedRecord | null>(
      null,
    );
  const selected = selectedRecord?.object ?? null;
  const [action, setAction] = useState<"properties" | "export" | null>(null);
  const [designMode, setDesignMode] = useState<
    "inpaint" | "diversify" | "optimize" | null
  >(null);
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
  useEffect(() => {
    const c = new AbortController();
    setError("");
    setSelectedRecord(null);
    setRecords([]);
    setAction(null);
    async function load() {
      if (!targetArtifact || data.valid === 0) return;
      const info = await artifactInfo(
        artifactUrl(job.id, targetArtifact),
        c.signal,
      );
      const digest = info.sha256;
      if (typeof data.valid === "number" && data.valid !== info.records)
        throw new Error(
          "The declared candidate count does not match the original molecular records.",
        );
      if (
        data.core_verification &&
        (digest !== data.core_verification.qualified_sha256 ||
          info.records !== data.core_verification.qualified_count)
      )
        throw new Error(
          "The qualified molecular result does not match its scientific checks.",
        );
      const all: ScientificObject[] = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?source_job=${encodeURIComponent(job.id)}&limit=200&offset=${offset}`,
          { signal: c.signal },
        );
        all.push(
          ...page.filter(
            (v) =>
              v.source_job === job.id &&
              v.kind === "molecule" &&
              v.reference.sha256 === digest &&
              (!data.core_verification ||
                (v.reference.sha256 ===
                  data.core_verification.qualified_sha256 &&
                  v.reference.record < data.core_verification.qualified_count)),
          ),
        );
        if (page.length < 200) break;
      }
      if (!c.signal.aborted) {
        all.sort((a, b) => a.reference.record - b.reference.record);
        const current = Array.from({ length: info.records }, (_, record) => ({
          record,
          object: all.find((v) => v.reference.record === record),
        }));
        setRecords(current);
        setSelectedRecord(current[0] ?? null);
      }
    }
    void load().catch((e) => {
      if (!c.signal.aborted)
        setError(
          zh ? "分子结果与原始记录无法核对，请检查原始文件。" : String(e),
        );
    });
    return () => c.abort();
  }, [job.id, data.core_verification, targetArtifact, data.valid]);
  const names = [
    "protein_artifact",
    "pocket_artifact",
    "molecule_artifact",
    "report_artifact",
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
    artifact: ["结果文件", "Result file"],
  };
  const molecule =
    typeof data.molecule_artifact === "string" &&
    /\.(sdf|mol|mol2)$/.test(data.molecule_artifact)
      ? data.molecule_artifact
      : null;
  const protein =
    typeof data.protein_artifact === "string" ? data.protein_artifact : null;
  if (
    selected &&
    (action ||
      (designMode &&
        job.request.operation === "diffsbdd" &&
        "protein" in job.request.payload))
  )
    return (
      <ResearchHandoff
        language={language}
        onBack={() => {
          setAction(null);
          setDesignMode(null);
        }}
      >
        {action === "properties" ? (
          <PropertyForm
            key={selected.id + action}
            language={language}
            initialFile={selected.reference.asset_id}
            scientificInput={selected.reference}
            onCreated={() =>
              setMessage(
                zh
                  ? "性质任务已创建，可在任务记录中查看。"
                  : "Properties task created; view it in Task history.",
              )
            }
          />
        ) : (
          <DiffForm
            key={selected.id + (action ?? designMode)}
            mode={action === "export" ? "export" : designMode!}
            language={language}
            initialMolecule={selected.reference}
            initialProtein={
              job.request.operation === "diffsbdd"
                ? (job.request.payload
                    .protein as import("../research/types").MoleculeRef)
                : null
            }
            onCreated={() =>
              setMessage(
                zh
                  ? "新任务已创建，可在任务记录中查看。"
                  : "New task created; view it in Task history.",
              )
            }
          />
        )}
      </ResearchHandoff>
    );
  return (
    <section
      aria-label={
        zh ? "DiffSBDD 结果与下一步" : "DiffSBDD results and next steps"
      }
    >
      {designing && (
        <p className="field-help">
          {zh
            ? "生成数量不代表活性或亲和力；请继续比较性质和结合姿势。"
            : "Generated counts do not establish activity or affinity; compare properties and binding poses next."}
        </p>
      )}
      <ScientificDetails job={job} data={data} language={language} />
      {typeof data.valid === "number" && (
        <p>
          {data.core_verification
            ? zh
              ? "通过固定区域复核 / 采样尝试"
              : "Fixed-region checks passed / sampling attempts"
            : zh
              ? "有效候选 / 尝试数量"
              : "Valid candidates / attempts"}
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
      {data.valid === 0 && Boolean(data.report) && (
        <details>
          <summary>
            {zh ? "为什么没有有效候选？" : "Why were no candidates accepted?"}
          </summary>
          <ResultTree
            value={{
              rejected: (data.report as Record<string, unknown>).rejected,
            }}
            zh={zh}
          />
        </details>
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
      {!records.length && molecule && data.valid !== 0 && !error && (
        <StructureViewer
          urls={[artifactUrl(job.id, molecule)]}
          language={language}
        />
      )}
      {protein && (
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
            url={artifactUrl(job.id, targetArtifact)}
            selected={selectedRecord}
            language={language}
            verification={data.core_verification}
            onSelect={(value) => {
              setSelectedRecord(value);
              setAction(null);
            }}
          />
          {selected &&
            job.request.operation === "diffsbdd" &&
            "protein" in job.request.payload && (
              <label className="field">
                {zh
                  ? "下一轮想怎样设计？"
                  : "What should the next design round do?"}
                <select
                  value={designMode ?? ""}
                  onChange={(e) =>
                    setDesignMode((e.target.value || null) as typeof designMode)
                  }
                >
                  <option value="">—</option>
                  <option value="inpaint">
                    {zh
                      ? "保留核心，局部重设计"
                      : "Keep a core and redesign locally"}
                  </option>
                  <option value="diversify">
                    {zh ? "围绕当前分子多样化" : "Diversify this molecule"}
                  </option>
                  <option value="optimize">
                    {zh ? "按 QED/SA 优化" : "Optimize QED/SA"}
                  </option>
                </select>
              </label>
            )}
          {selected && (
            <div className="editor-toolbar">
              <button type="button" onClick={() => setAction("properties")}>
                {zh
                  ? "计算这个候选的性质"
                  : "Calculate this candidate's properties"}
              </button>
              <button type="button" onClick={() => setAction("export")}>
                {zh ? "导出这个候选" : "Export this candidate"}
              </button>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
