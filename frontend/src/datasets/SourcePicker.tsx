import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import type { AvailableDataset, DatasetSource } from "./types";
import { datasetName } from "./source-label";

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
  const known = useRef(new Map<string, AvailableDataset>());
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      void request<AvailableDataset[]>(
        `/datasets/results?role=${role}&search=${encodeURIComponent(search)}`,
        {
          signal: c.signal,
        },
      )
        .then((records) => {
          records.forEach((item) => known.current.set(item.job_id, item));
          setItems(records);
          setError("");
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [role, search]);
  const selected = new Set(values.map((item) => item.job_id)),
    filtered = items.filter((item) =>
      [item.name, datasetName(item, language)].some((name) =>
        name.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  function toggle(item: AvailableDataset) {
    onChange(
      multiple
        ? selected.has(item.job_id)
          ? values
              .filter((value) => value.job_id !== item.job_id)
              .map(
                (value) =>
                  known.current.get(value.job_id) ??
                  (value as AvailableDataset),
              )
          : [
              ...values.map(
                (value) =>
                  known.current.get(value.job_id) ??
                  (value as AvailableDataset),
              ),
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
              <strong>{datasetName(item, language)}</strong>
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
