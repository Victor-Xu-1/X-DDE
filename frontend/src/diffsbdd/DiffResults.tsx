import { useEffect, useState } from "react";
import { api, artifactUrl, request } from "../api";
import type { Job, Language } from "../types";
import type { ScientificObject } from "../research/types";
import type { OperationResult } from "../operations/types";
import { DiffForm } from "./DiffForm";
import { PropertyForm } from "../operations/PropertyForm";
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
    setSelected(null);
    setAction(null);
    async function load() {
      const all: ScientificObject[] = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?limit=200&offset=${offset}`,
          { signal: c.signal },
        );
        all.push(
          ...page.filter(
            (v) => v.source_job === job.id && v.kind === "molecule",
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
  }, [job.id]);
  const names = [
    "protein_artifact",
    "pocket_artifact",
    "molecule_artifact",
    "report_artifact",
    "artifact",
  ].flatMap((key) =>
    typeof data[key] === "string" ? [{ key, name: data[key] as string }] : [],
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
          ? "结果保留输入版本、原生报告及计算来源。有效分子数量表示解析与生成状态，不表示实验活性或预测亲和力。"
          : "Results retain input versions, native reports and provenance. Valid molecule counts describe parsing and generation, not experimental activity or predicted affinity."}
      </p>
      {typeof data.valid === "number" && (
        <p>
          {zh ? "有效候选 / 尝试数量" : "Valid candidates / attempts"}:{" "}
          {data.valid} / {String(data.attempted)}
        </p>
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
            {zh ? "筛选已登记候选" : "Filter registered candidates"}
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
                    onClick={() => {
                      setSelected(v);
                      setAction(null);
                    }}
                  >
                    {v.label} · {zh ? "记录" : "Record"}{" "}
                    {v.reference.record + 1}
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
      <details>
        <summary>
          {zh ? "原生结果与来源详情" : "Native result and provenance details"}
        </summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </section>
  );
}
