import { useState, type ReactNode } from "react";
import type { Language } from "../types";
import type { AvailableDataset, DatasetSource } from "./types";
import { datasetName } from "./source-label";
import { researchError } from "../presentation/research-content";
import { useDatasetSources } from "./useDatasetSources";

function recordLabel(item: AvailableDataset, zh: boolean) {
  const count =
    item.counts.indexed ??
    item.counts.unique_compounds ??
    item.counts.observed_members ??
    item.counts.decoded_reads;
  return count === undefined
    ? zh
      ? "已完成的研究结果"
      : "Completed research result"
    : `${count.toLocaleString()} ${zh ? "条研究记录" : "research records"}`;
}

export function SourcePicker({
  language,
  role,
  values,
  onChange,
  multiple = false,
  label,
  emptyAction,
}: {
  language: Language;
  role: DatasetSource["role"];
  values: DatasetSource[];
  onChange(values: AvailableDataset[]): void;
  multiple?: boolean;
  label: string;
  emptyAction?: ReactNode;
}) {
  const zh = language === "zh",
    [search, setSearch] = useState("");
  const { items, loading, error, retry, resolve } = useDatasetSources(
    role,
    search,
  );
  const retained = values.filter(
    (value): value is AvailableDataset =>
      value.role === role &&
      "name" in value &&
      typeof value.name === "string" &&
      "counts" in value &&
      typeof value.counts === "object" &&
      value.counts !== null &&
      "metadata" in value &&
      typeof value.metadata === "object" &&
      value.metadata !== null,
  );
  const records = [
    ...new Map(
      [...retained, ...items]
        .filter((item) => item.role === role)
        .map((item) => [item.job_id, item]),
    ).values(),
  ];
  const selected = (item: AvailableDataset) =>
    values.some(
      (value) =>
        value.job_id === item.job_id &&
        value.report_sha256 === item.report_sha256 &&
        value.role === item.role,
    );
  const filtered = records.filter((item) =>
    [item.name, datasetName(item, language)].some((name) =>
      name.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  function toggle(item: AvailableDataset) {
    onChange(
      multiple
        ? selected(item)
          ? values.filter((value) => value.job_id !== item.job_id).map(resolve)
          : [
              ...values
                .filter((value) => value.job_id !== item.job_id)
                .map(resolve),
              item,
            ]
        : [item],
    );
  }
  return (
    <section className="dataset-source-picker">
      <div className="dataset-field-heading">
        <strong>{label}</strong>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={zh ? "搜索研究文件" : "Search research files"}
          aria-label={zh ? "搜索研究文件" : "Search research files"}
        />
      </div>
      {loading ? (
        <p className="dataset-empty" role="status">
          {zh ? "正在读取研究结果…" : "Loading research results…"}
        </p>
      ) : !filtered.length && !error ? (
        <div className="dataset-empty" role="status">
          {search ? (
            <>
              <p>
                {zh ? "没有匹配的研究结果。" : "No matching research results."}
              </p>
              <button type="button" onClick={() => setSearch("")}>
                {zh ? "清除搜索" : "Clear search"}
              </button>
            </>
          ) : (
            (emptyAction ?? (
              <p>
                {zh
                  ? "还没有完成的研究材料，请先准备新文件或使用真实模板。"
                  : "No completed materials yet. Prepare a new file or use a real example."}
              </p>
            ))
          )}
        </div>
      ) : null}
      <div className="dataset-source-list">
        {filtered.map((item) => (
          <button
            type="button"
            key={item.job_id}
            aria-pressed={selected(item)}
            onClick={() => toggle(item)}
          >
            <span className="dataset-source-icon" aria-hidden>
              {selected(item) ? "✓" : "▦"}
            </span>
            <span>
              <strong>{datasetName(item, language)}</strong>
              <small>{recordLabel(item, zh)}</small>
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {researchError(error, zh)}{" "}
          <button type="button" onClick={retry}>
            {zh ? "重新读取" : "Retry"}
          </button>
        </p>
      )}
    </section>
  );
}
