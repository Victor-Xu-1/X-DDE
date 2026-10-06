import { useEffect, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import type { AvailableDataset, DatasetSource } from "./types";

export function SourcePicker({
  language,
  role,
  values,
  onChange,
  multiple = false,
  label,
}: {
  language: Language;
  role: DatasetSource["role"];
  values: DatasetSource[];
  onChange(values: AvailableDataset[]): void;
  multiple?: boolean;
  label: string;
}) {
  const zh = language === "zh",
    [items, setItems] = useState<AvailableDataset[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void request<AvailableDataset[]>(`/datasets/results?role=${role}`, {
      signal: c.signal,
    })
      .then(setItems)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [role]);
  const selected = new Set(values.map((item) => item.job_id)),
    filtered = items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase()),
    );
  function toggle(item: AvailableDataset) {
    onChange(
      multiple
        ? selected.has(item.job_id)
          ? items.filter(
              (value) =>
                selected.has(value.job_id) && value.job_id !== item.job_id,
            )
          : items.filter(
              (value) =>
                selected.has(value.job_id) || value.job_id === item.job_id,
            )
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
      {!items.length && !error && (
        <p className="dataset-empty">
          {zh
            ? "还没有完成的研究材料，请先准备新文件或使用真实模板。"
            : "No completed materials yet. Prepare a new file or use a real example."}
        </p>
      )}
      <div className="dataset-source-list">
        {filtered.map((item) => (
          <button
            type="button"
            key={item.job_id}
            aria-pressed={selected.has(item.job_id)}
            onClick={() => toggle(item)}
          >
            <span className="dataset-source-icon" aria-hidden>
              {selected.has(item.job_id) ? "✓" : "▦"}
            </span>
            <span>
              <strong>{item.name}</strong>
              <small>
                {(
                  item.counts.indexed ??
                  item.counts.unique_compounds ??
                  item.counts.observed_members ??
                  item.counts.decoded_reads ??
                  0
                ).toLocaleString()}{" "}
                {zh ? "条研究记录" : "research records"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
