import { useId, useMemo, useState, type ReactNode } from "react";
import {
  DownloadOutlined,
  SearchOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import type { Language } from "../types";
import {
  compareValues,
  csvCell,
  type CellValue,
  type SortOrder,
} from "./table-model";
import "./research-table.css";
import { TableColumns } from "./TableColumns";
import { useTableColumns } from "./useTableColumns";
import { ResultRow } from "./ResultRow";

export interface ResearchColumn<T> {
  key: string;
  label: ReactNode;
  exportLabel?: string;
  value(row: T): CellValue;
  render?(row: T): ReactNode;
  numeric?: boolean;
  sortable?: boolean;
}
/** View state only: records and their scientific identities always stay unchanged. */
export function ResearchTable<T>({
  rows,
  columns,
  rowId,
  language,
  title,
  selected,
  onSelect,
  canSelect,
  initialSort,
  initialVisibleColumns,
  compare = true,
  exportName = "research-results.csv",
}: {
  rows: readonly T[];
  columns: readonly ResearchColumn<T>[];
  rowId(row: T): string;
  language: Language;
  title: string;
  selected?: string | null;
  onSelect?(row: T): void;
  canSelect?(row: T): boolean;
  initialSort?: SortOrder;
  initialVisibleColumns?: readonly string[];
  compare?: boolean;
  exportName?: string;
}) {
  const zh = language === "zh",
    id = useId();
  const view = useTableColumns(columns, initialVisibleColumns);
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<SortOrder | null>(initialSort ?? null);
  const [page, setPage] = useState(0),
    [marked, setMarked] = useState<string[]>([]),
    [comparing, setComparing] = useState(false);
  const size = 20;
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const filtered = rows.filter(
      (row) =>
        !term ||
        columns.some((c) =>
          String(c.value(row) ?? "")
            .toLocaleLowerCase()
            .includes(term),
        ),
    );
    const column = sort && columns.find((c) => c.key === sort.key);
    return column && sort
      ? [...filtered].sort((a, b) =>
          compareValues(column.value(a), column.value(b), sort.direction),
        )
      : filtered;
  }, [rows, columns, query, sort]);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / size) - 1),
  );
  const displayed = visible.slice(currentPage * size, (currentPage + 1) * size);
  const compared = rows.filter((row) => marked.includes(rowId(row)));
  function toggleSort(key: string) {
    setSort((previous) => ({
      key,
      direction:
        previous?.key === key && previous.direction === "ascending"
          ? "descending"
          : "ascending",
    }));
    setPage(0);
  }
  function exportRows() {
    const header = columns
      .map((c) =>
        csvCell(
          c.exportLabel ?? (typeof c.label === "string" ? c.label : c.key),
        ),
      )
      .join(",");
    const body = visible
      .map((row) => columns.map((c) => csvCell(c.value(row))).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", header, "\r\n", body], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = exportName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function cell(row: T, column: ResearchColumn<T>) {
    const value = column.value(row);
    if (column.render) return column.render(row);
    if (value == null || (typeof value === "number" && !Number.isFinite(value)))
      return <span className="muted">—</span>;
    return (
      <span title={String(value)}>
        {typeof value === "number" && !Number.isInteger(value)
          ? Number(value.toPrecision(6))
          : typeof value === "boolean"
            ? value
              ? zh
                ? "是"
                : "Yes"
              : zh
                ? "否"
                : "No"
            : value}
      </span>
    );
  }
  return (
    <section
      className="research-table"
      aria-label={title}
      aria-describedby={id}
    >
      <div className="research-table-toolbar">
        <label className="result-search">
          <SearchOutlined aria-hidden="true" />
          <span className="sr-only">
            {zh ? "搜索" : "Search"} · {title}
          </span>
          <input
            type="search"
            value={query}
            placeholder={zh ? "搜索名称或结果…" : "Search names or results…"}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <span className="research-table-count" aria-live="polite">
          {visible.length} / {rows.length}
        </span>
        {compare && rows.length > 1 && (
          <button
            type="button"
            className="secondary-button"
            disabled={compared.length < 2 || view.shown.length < 2}
            aria-expanded={comparing}
            onClick={() => setComparing(!comparing)}
          >
            <SwapOutlined aria-hidden="true" /> {zh ? "对比" : "Compare"}
            {compared.length ? " (" + compared.length + ")" : ""}
          </button>
        )}
        <TableColumns
          columns={columns}
          visible={view.visible}
          language={language}
          onToggle={(key) => {
            if (sort?.key === key) setSort(null);
            setComparing(false);
            view.toggle(key);
          }}
          onReset={() => {
            setSort(null);
            setComparing(false);
            view.select(view.defaults);
          }}
          onShowAll={() => view.select(columns.map((column) => column.key))}
        />
        <button
          type="button"
          className="secondary-button result-export"
          title={
            zh
              ? "按当前筛选导出全部原始指标"
              : "Export all original metrics for the filtered rows"
          }
          disabled={!visible.length}
          onClick={exportRows}
        >
          <DownloadOutlined aria-hidden="true" />{" "}
          {zh ? "导出筛选结果" : "Export filtered rows"}
        </button>
      </div>
      {comparing && compared.length >= 2 && (
        <div
          className="research-comparison table-scroll"
          role="region"
          aria-label={zh ? "结果对比" : "Result comparison"}
        >
          <table>
            <caption>
              {zh
                ? "原始指标并列对比 · 未归一化"
                : "Original metrics side by side · not normalized"}
            </caption>
            <thead>
              <tr>
                <th>{zh ? "指标" : "Metric"}</th>
                {compared.map((row) => (
                  <th key={rowId(row)}>{cell(row, columns[0])}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.shown.slice(1).map((column) => (
                <tr key={column.key}>
                  <th scope="row">{column.label}</th>
                  {compared.map((row) => (
                    <td key={rowId(row)}>{cell(row, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="research-table-scroll table-scroll">
        <table aria-label={title}>
          <thead>
            <tr>
              {compare && rows.length > 1 && (
                <th className="mark-cell">
                  <span className="sr-only">
                    {zh ? "选择对比" : "Select for comparison"}
                  </span>
                </th>
              )}
              {view.shown.map((column) => (
                <th
                  key={column.key}
                  title={column.exportLabel}
                  aria-sort={
                    sort?.key === column.key ? sort.direction : undefined
                  }
                  className={column.numeric ? "numeric-cell" : ""}
                >
                  {column.sortable === false ? (
                    column.label
                  ) : typeof column.label !== "string" ? (
                    <span className="column-header-content">
                      {column.label}
                      <button
                        type="button"
                        className="column-sort"
                        aria-label={
                          (zh ? "排序 " : "Sort ") +
                          (column.exportLabel ?? column.key)
                        }
                        onClick={() => toggleSort(column.key)}
                      >
                        {sort?.key === column.key
                          ? sort.direction === "ascending"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="column-sort"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {sort?.key === column.key
                          ? sort.direction === "ascending"
                            ? "↑"
                            : "↓"
                          : "↕"}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => {
              const key = rowId(row);
              const selectable = !!onSelect && (canSelect?.(row) ?? true);
              return (
                <ResultRow
                  key={key}
                  selected={selected === key}
                  disabled={!selectable}
                  onSelect={onSelect ? () => onSelect(row) : undefined}
                >
                  {compare && rows.length > 1 && (
                    <td className="mark-cell">
                      <input
                        type="checkbox"
                        aria-label={
                          (zh ? "对比 " : "Compare ") +
                          String(columns[0].value(row) ?? key)
                        }
                        checked={marked.includes(key)}
                        disabled={!marked.includes(key) && compared.length >= 4}
                        onChange={(e) =>
                          setMarked((v) =>
                            e.target.checked
                              ? [...v, key]
                              : v.filter((value) => value !== key),
                          )
                        }
                      />
                    </td>
                  )}
                  {view.shown.map((column, index) => (
                    <td
                      key={column.key}
                      className={column.numeric ? "numeric-cell" : ""}
                    >
                      {index === 0 && onSelect && !column.render ? (
                        <button
                          type="button"
                          className="record-select"
                          aria-pressed={selected === key}
                          disabled={!selectable}
                          onClick={() => onSelect(row)}
                        >
                          {cell(row, column)}
                        </button>
                      ) : (
                        cell(row, column)
                      )}
                    </td>
                  ))}
                </ResultRow>
              );
            })}
          </tbody>
        </table>
        {!displayed.length && (
          <p className="result-empty" role="status">
            {zh
              ? "没有匹配结果，请调整搜索。"
              : "No matching results. Adjust the search."}
          </p>
        )}
      </div>
      <footer className="research-table-footer">
        <span>
          {zh ? "显示" : "Showing"}{" "}
          {visible.length ? currentPage * size + 1 : 0}–
          {Math.min((currentPage + 1) * size, visible.length)} /{" "}
          {visible.length}
        </span>
        {visible.length > size && (
          <div>
            <button
              type="button"
              aria-label={zh ? "上一页" : "Previous page"}
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ←
            </button>
            <span>
              {currentPage + 1} / {Math.ceil(visible.length / size)}
            </span>
            <button
              type="button"
              aria-label={zh ? "下一页" : "Next page"}
              disabled={(currentPage + 1) * size >= visible.length}
              onClick={() => setPage(currentPage + 1)}
            >
              →
            </button>
          </div>
        )}
        {compared.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMarked([]);
              setComparing(false);
            }}
          >
            {zh ? "清除对比选择" : "Clear comparison"}
          </button>
        )}
      </footer>
      <span id={id} className="sr-only">
        {zh
          ? "筛选和排序只改变显示，不修改原始研究记录。"
          : "Filtering and sorting change this view, never the original records."}
      </span>
    </section>
  );
}
