import { useEffect, useState } from "react";
import { api, artifactUrl, request } from "../api";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { OperationResult } from "../operations/types";
import { DiffForm } from "./DiffForm";
import { CoreVerification } from "./CoreVerification";
import { PropertyForm } from "../operations/PropertyForm";
import { isResearchFile } from "../presentation/research-files";
import { StructureViewer } from "../viewer/StructureViewer";

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
    [objects, setObjects] = useState<ScientificObject[]>([]),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<ScientificObject | null>(null),
    [action, setAction] = useState<"properties" | "export" | null>(null);
  const [designMode, setDesignMode] = useState<
    "inpaint" | "diversify" | "optimize" | null
  >(null);
  const [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setObjects([]);
    setError("");
    setSelected(null);
    setAction(null);
    async function load() {
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
              (!data.core_verification ||
                (v.reference.sha256 ===
                  data.core_verification.qualified_sha256 &&
                  v.reference.record < data.core_verification.qualified_count)),
          ),
        );
        if (page.length < 200) break;
      }
      if (!c.signal.aborted) setObjects(all);
    }
    void load().catch((e) => {
      if (!c.signal.aborted) setError(String(e));
    });
    return () => c.abort();
  }, [job.id, data.core_verification]);
  const names = [
    "protein_artifact",
    "pocket_artifact",
    "molecule_artifact",
    "report_artifact",
    "artifact",
  ].flatMap((key) =>
    typeof data[key] === "string" && isResearchFile(data[key] as string)
      ? [{ key, name: data[key] as string }]
      : [],
  );
  const protein =
    typeof data.protein_artifact === "string" ? data.protein_artifact : null;
  return (
    <section
      aria-label={
        zh ? "DiffSBDD 结果与下一步" : "DiffSBDD results and next steps"
      }
    >
      <p className="notice">
        {zh
          ? "生成数量不代表活性或亲和力；请继续比较性质和结合姿势。"
          : "Generated counts do not establish activity or affinity; compare properties and binding poses next."}
      </p>
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
      {names.length > 0 && (
        <ul>
          {names.map((v) => (
            <li key={v.key}>
              <a href={artifactUrl(job.id, v.name)} download>
                {v.name}
              </a>
            </li>
          ))}
        </ul>
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
      {objects.length > 0 && (
        <>
          <label className="field">
            {zh ? "查找候选分子" : "Find candidates"}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ul>
            {objects
              .filter((v) =>
                `${v.label} ${v.reference.record + 1}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-pressed={selected?.id === v.id}
                    title={`${v.label} · ${zh ? "SDF 记录" : "SDF record"} ${v.reference.record + 1}`}
                    onClick={() => {
                      setSelected(v);
                      setAction(null);
                    }}
                  >
                    {data.core_verification
                      ? `${zh ? "候选" : "Candidate"} ${(data.core_verification.candidates.find((c) => c.qualified_record === v.reference.record)?.record ?? v.reference.record) + 1} · ${zh ? "固定区域检查通过" : "Fixed-region checks passed"}`
                      : `${v.label} · ${zh ? "记录" : "Record"} ${v.reference.record + 1}`}
                  </button>
                </li>
              ))}
          </ul>
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
      {selected && action === "properties" && (
        <PropertyForm
          key={selected.id}
          language={language}
          initialFile={selected.reference.asset_id}
          scientificInput={selected.reference}
          onCreated={(j) =>
            setMessage(
              (zh ? "已创建性质任务：" : "Created properties task: ") + j.id,
            )
          }
        />
      )}
      {selected && action === "export" && (
        <DiffForm
          key={selected.id}
          mode="export"
          language={language}
          initialMolecule={selected.reference}
          onCreated={(j) =>
            setMessage(
              (zh ? "已创建导出任务：" : "Created export task: ") + j.id,
            )
          }
        />
      )}
      {selected &&
        designMode &&
        job.request.operation === "diffsbdd" &&
        "protein" in job.request.payload && (
          <DiffForm
            key={selected.id + designMode}
            mode={designMode}
            language={language}
            initialProtein={
              job.request.payload
                .protein as import("../research/types").MoleculeRef
            }
            initialMolecule={selected.reference}
            onCreated={(j) =>
              setMessage(
                (zh ? "已创建下一轮任务：" : "Created next-round task: ") +
                  j.id,
              )
            }
          />
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
