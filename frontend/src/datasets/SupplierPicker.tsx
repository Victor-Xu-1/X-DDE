import { useEffect, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import type { Supplier } from "./types";

export function SupplierPicker({
  language,
  value,
  onChange,
}: {
  language: Language;
  value: string;
  onChange(value: string): void;
}) {
  const zh = language === "zh",
    [items, setItems] = useState<Supplier[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void request<Supplier[]>("/datasets/suppliers", { signal: c.signal })
      .then(setItems)
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, []);
  const chosen = items.find((item) => item.id === value);
  return (
    <div className="dataset-supplier-selection">
      <label className="field">
        {zh ? "分子来源" : "Compound source"}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="custom">
            {zh ? "自有或其他来源" : "Owned or other source"}
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {chosen?.catalogue_url && (
        <a
          href={chosen.catalogue_url}
          target="_blank"
          rel="noreferrer"
          className="text-button"
        >
          {zh
            ? "从供应商官方网站获取文件 ↗"
            : "Get files from the official supplier ↗"}
        </a>
      )}
      {error && (
        <p role="alert" className="error-box">
          {zh
            ? "暂时无法读取供应商目录，可选择自有文件继续。"
            : "Supplier directory unavailable. An owned file can still be imported."}
        </p>
      )}
    </div>
  );
}
