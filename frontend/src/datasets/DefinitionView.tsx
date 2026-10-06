import { useEffect, useState } from "react";
import { request, artifactUrl } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import type { Job, Language } from "../types";
import type { DatasetResult } from "./types";

interface DefinitionPage {
  library: string;
  cycles: { cycle: number; bb_set_name: string }[];
  barcode_schema: Record<string, { tag: string; overhang?: string }>;
  rows: { id: string; tag: string; smiles?: string }[];
  total: number;
  offset: number;
  has_more: boolean;
}
export function DefinitionView({
  job,
  result,
  language,
}: {
  job: Job;
  result: DatasetResult;
  language: Language;
}) {
  const zh = language === "zh",
    libraries = result.metadata.libraries as {
      library: string;
      members: number;
      cycles: number;
      can_enumerate: boolean;
    }[],
    [library, setLibrary] = useState(libraries?.[0]?.library ?? ""),
    [cycle, setCycle] = useState(0),
    [offset, setOffset] = useState(0),
    [page, setPage] = useState<DefinitionPage | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void request<DefinitionPage>(
      `/datasets/${job.id}/definition?library=${encodeURIComponent(library)}&cycle=${cycle}&offset=${offset}`,
      { signal: c.signal },
    )
      .then(setPage)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [job.id, library, cycle, offset]);
  return (
    <section className="del-definition-view">
      <div className="dataset-table-toolbar">
        <label>
          {zh ? "DEL 库" : "Library"}
          <select
            value={library}
            onChange={(e) => {
              setLibrary(e.target.value);
              setCycle(0);
              setOffset(0);
            }}
          >
            {libraries.map((item) => (
              <option key={item.library}>{item.library}</option>
            ))}
          </select>
        </label>
        <span>
          {libraries
            .find((item) => item.library === library)
            ?.members.toLocaleString()}{" "}
          {zh ? "理论成员" : "theoretical members"}
        </span>
        <a
          className="secondary-button"
          href={artifactUrl(job.id, "del-definition.json")}
        >
          {zh ? "下载库定义" : "Download library definition"}
        </a>
      </div>
      <div
        className="del-barcode-map"
        aria-label={zh ? "编码区段" : "Barcode segments"}
      >
        {Object.entries(page?.barcode_schema ?? {}).map(
          ([name, section], index) => (
            <div
              key={name}
              style={
                {
                  "--segment-color": [
                    "#4d70db",
                    "#7c64d8",
                    "#27a596",
                    "#dcaa45",
                  ][index % 4],
                } as React.CSSProperties
              }
            >
              <strong>{name}</strong>
              <span>
                {section.tag.length} {zh ? "碱基" : "bases"}
              </span>
              <code>{section.tag}</code>
            </div>
          ),
        )}
      </div>
      <div className="dataset-result-tabs">
        {page?.cycles.map((item, index) => (
          <button
            type="button"
            key={item.cycle}
            aria-pressed={cycle === index}
            onClick={() => {
              setCycle(index);
              setOffset(0);
            }}
          >
            {zh ? "周期" : "Cycle"} {item.cycle} · {item.bb_set_name}
          </button>
        ))}
      </div>
      <div className="dataset-block-grid">
        {page?.rows.map((row) => (
          <article key={row.id}>
            <div>
              <strong>{row.id}</strong>
              <code>{row.tag}</code>
            </div>
            {row.smiles ? (
              <MoleculeImage
                source={{ smiles: row.smiles }}
                language={language}
                label={row.id}
              />
            ) : (
              <p className="dataset-unresolved">
                {zh ? "未提供化学结构" : "Chemical structure not supplied"}
              </p>
            )}
          </article>
        ))}
      </div>
      <div className="dataset-table-footer">
        <button
          type="button"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {zh ? "上一页" : "Previous"}
        </button>
        <span>
          {page?.total.toLocaleString()} {zh ? "个砌块" : "building blocks"}
        </span>
        <button
          type="button"
          disabled={!page?.has_more}
          onClick={() => setOffset(offset + 20)}
        >
          {zh ? "下一页" : "Next"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
