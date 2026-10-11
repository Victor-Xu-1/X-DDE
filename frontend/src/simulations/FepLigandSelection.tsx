import { useState } from "react";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { AssetFileError } from "../research/asset-file";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { FepRecord } from "./fep-series";

const pageSize = 12;
export function FepLigandSelection({
  source,
  selected,
  onChange,
  language,
  records,
  error,
  onRetry,
}: {
  source: MoleculeRef | null;
  selected: number[];
  onChange(records: number[]): void;
  language: Language;
  records?: FepRecord[];
  error?: unknown;
  onRetry(): void;
}) {
  const zh = language === "zh";
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const nameOf = (item: FepRecord) =>
    item.name || `${zh ? "分子" : "Molecule"} ${item.record + 1}`;
  const filtered = (records ?? []).filter((item) =>
    `${nameOf(item)} ${item.record + 1}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const chosen = (records ?? []).filter((item) =>
    selected.includes(item.record),
  );
  const errorText =
    error instanceof AssetFileError
      ? error.code === "identity"
        ? zh
          ? "文件与所选历史记录不一致，请重新选择原始文件。"
          : "The file does not match the selected record. Choose the original file again."
        : error.code === "limit"
          ? zh
            ? "请先导出不超过 500 个分子、25 MiB 的系列。"
            : "Export a series of up to 500 molecules and 25 MiB first."
          : zh
            ? "请选择完整的 SDF 分子文件。"
            : "Choose a complete SDF molecular file."
      : zh
        ? "暂时无法读取分子，请重试。"
        : "The molecular series could not be read. Try again.";
  return (
    <section aria-label={zh ? "选择 FEP 分子" : "Select FEP molecules"}>
      <p className="field-help">
        {zh
          ? "选择 2–12 个同系列分子。使用已在同一个蛋白坐标系中对齐的结合姿势。"
          : "Select 2–12 congeneric molecules with binding poses aligned in the same protein frame."}
      </p>
      {source && !records && !error && (
        <p role="status">
          {zh ? "正在读取分子系列…" : "Reading the molecular series…"}
        </p>
      )}
      {Boolean(error) && (
        <div className="simulation-input-error">
          <p role="alert">{errorText}</p>
          <button type="button" className="secondary-button" onClick={onRetry}>
            {zh ? "重新读取" : "Try again"}
          </button>
        </div>
      )}
      {records && (
        <>
          <div className="simulation-series-toolbar">
            <input
              type="search"
              aria-label={
                zh ? "搜索分子名称或序号" : "Search molecules by name or record"
              }
              placeholder={
                zh ? "搜索分子名称或序号" : "Search molecules by name or record"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <output aria-label={zh ? "已选择分子" : "Selected molecules"}>
              {selected.length} / 12 {zh ? "已选择" : "selected"}
            </output>
          </div>
          {chosen.length > 0 && (
            <div
              className="simulation-series-selection"
              aria-label={zh ? "所选分子" : "Chosen molecules"}
            >
              {chosen.map((item) => (
                <button
                  type="button"
                  className="secondary-button"
                  key={item.record}
                  aria-label={`${zh ? "移除" : "Remove"} ${nameOf(item)} · ${item.record + 1}`}
                  onClick={() =>
                    onChange(
                      selected.filter((record) => record !== item.record),
                    )
                  }
                >
                  {nameOf(item)} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
          {!filtered.length && (
            <p role="status">
              {zh ? "没有匹配的分子。" : "No matching molecules."}
            </p>
          )}
          <div className="simulation-ligand-grid">
            {filtered
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((item) => (
                <label
                  key={item.record}
                  className={
                    selected.includes(item.record) ? "is-selected" : ""
                  }
                >
                  <span>
                    <input
                      type="checkbox"
                      aria-label={`${nameOf(item)} · ${item.record + 1}`}
                      checked={selected.includes(item.record)}
                      disabled={
                        !selected.includes(item.record) && selected.length >= 12
                      }
                      onChange={(e) =>
                        onChange(
                          e.target.checked
                            ? [...selected, item.record].sort((a, b) => a - b)
                            : selected.filter(
                                (record) => record !== item.record,
                              ),
                        )
                      }
                    />
                    {nameOf(item)}
                  </span>
                  <MoleculeImage
                    compact
                    source={
                      source
                        ? {
                            url: `/api/assets/${encodeURIComponent(source.asset_id)}`,
                            record: item.record,
                          }
                        : null
                    }
                    language={language}
                    label={nameOf(item)}
                  />
                </label>
              ))}
          </div>
          {filtered.length > pageSize && (
            <nav
              className="simulation-series-pagination"
              aria-label={zh ? "分子系列分页" : "Molecular series pages"}
            >
              <button
                type="button"
                className="secondary-button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                {zh ? "上一页" : "Previous page"}
              </button>
              <output>
                {current + 1} / {pages} · {filtered.length}{" "}
                {zh ? "个分子" : "molecules"}
              </output>
              <button
                type="button"
                className="secondary-button"
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
              >
                {zh ? "下一页" : "Next page"}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
