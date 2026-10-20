import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";
import { evidenceNotes } from "./evidence-labels";
import { supplierLabel } from "./supplier-label";
import { ResultRow } from "../presentation/ResultRow";
import { memberPageCsv } from "./member-page-export";
import { downloadBlob } from "../presentation/visual-export";
import { umiStateLabel } from "./sequencing-quality";

export type TableRow = Record<string, string | number | null>;
interface Page {
  rows: TableRow[];
  total: number;
  offset: number;
  has_more: boolean;
}
const labels: Record<string, [string, string]> = {
  id: ["分子", "Molecule"],
  member: ["成员", "Member"],
  smiles: ["结构", "Structure"],
  mw: ["分子量", "MW"],
  logp: ["LogP", "LogP"],
  tpsa: ["极性表面积", "TPSA"],
  qed: ["QED", "QED"],
  offers: ["来源记录", "Source records"],
  supplier: ["来源", "Source"],
  selection: ["靶点计数", "Target counts"],
  reference: ["对照计数", "Reference counts"],
  score: ["富集倍数", "Enrichment"],
  lower: ["计数区间下限", "Count lower"],
  upper: ["计数区间上限", "Count upper"],
  replicate_cv: ["靶点样本 CV", "Target-sample CV"],
  supporting_samples: ["支持样本数", "Supporting samples"],
  target_samples: ["靶点样本数", "Target samples"],
  sample: ["样本", "Sample"],
  raw: ["读段", "Reads"],
  unique_umi: ["独立 UMI", "Unique UMIs"],
  corrected_umi: ["纠错 UMI", "Corrected UMIs"],
  eligible_reads: ["完整 UMI 读段", "Complete-UMI reads"],
  excluded_reads: ["不用于 UMI 去重", "Excluded from UMI deduplication"],
  umi: ["UMI 序列", "UMI sequence"],
  reads: ["读段", "Reads"],
  observed_length: ["UMI 长度", "UMI length"],
  expected_length: ["定义长度", "Expected length"],
  umi_status: ["UMI 完整性", "UMI completeness"],
  kind: ["系列", "Series"],
  block_a: ["砌块 A", "Block A"],
  block_b: ["砌块 B", "Block B"],
  members: ["观察成员", "Observed members"],
  endpoint: ["测量指标", "Endpoint"],
  unit: ["单位", "Unit"],
  value: ["报告值", "Reported value"],
  matched: ["关联原成员", "Linked member"],
  qualifier: ["报告说明", "Reported observation"],
  flags: ["证据提示", "Evidence notes"],
};
const views = {
  library: ["id", "smiles", "mw", "logp", "tpsa", "qed", "offers"],
  index: ["id", "smiles", "supplier"],
  enrichment: [
    "member",
    "smiles",
    "selection",
    "reference",
    "score",
    "lower",
    "upper",
    "replicate_cv",
    "flags",
  ],
  counts: [
    "member",
    "sample",
    "raw",
    "eligible_reads",
    "excluded_reads",
    "unique_umi",
    "corrected_umi",
  ],
  decoded: [
    "member",
    "sample",
    "umi",
    "reads",
    "observed_length",
    "expected_length",
    "umi_status",
  ],
  series: [
    "kind",
    "block_a",
    "block_b",
    "members",
    "selection",
    "reference",
    "score",
  ],
  followup: ["member", "endpoint", "unit", "value", "qualifier", "matched"],
} as const;
function format(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "number")
    return Math.abs(value) > 1e5
      ? value.toExponential(2)
      : Number.isInteger(value)
        ? value.toLocaleString()
        : value.toFixed(3);
  return String(value);
}
export function ResearchTable({
  jobId,
  view,
  comparison = "",
  language,
  onSelect,
  onSelection,
  selection = [],
  onRowsLoaded,
  defaultPrioritized = false,
}: {
  jobId: string;
  view: keyof typeof views;
  comparison?: string;
  language: Language;
  onSelect?(row: TableRow): void;
  onSelection?(ids: string[]): void;
  selection?: string[];
  onRowsLoaded?(rows: TableRow[]): void;
  defaultPrioritized?: boolean;
}) {
  const receiver = useRef(onRowsLoaded);
  receiver.current = onRowsLoaded;
  const zh = language === "zh",
    [loaded, setPage] = useState<(Page & { queryKey: string }) | null>(null),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(defaultPrioritized),
    [seriesKind, setSeriesKind] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const queryKey = JSON.stringify([
    jobId,
    view,
    comparison,
    offset,
    search,
    filter,
    seriesKind,
  ]);
  const page = loaded?.queryKey === queryKey ? loaded : null;
  useEffect(() => {
    setOffset(0);
  }, [jobId, view, comparison, search, filter, seriesKind]);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setPage(null);
    setError("");
    const path =
      view === "library" || view === "index"
        ? `/datasets/${jobId}/members`
        : `/datasets/${jobId}/table`;
    const params = new URLSearchParams({
      limit: "20",
      offset: String(offset),
      search,
      ...(view === "library" || view === "index"
        ? {}
        : { view, comparison, prioritized: String(filter) }),
      ...(view === "series" ? { series_kind: seriesKind } : {}),
    });
    void request<Page>(`${path}?${params}`, { signal: c.signal })
      .then((value) => {
        if (!c.signal.aborted) {
          setPage({ ...value, queryKey });
          receiver.current?.(value.rows);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [jobId, view, comparison, offset, search, filter, seriesKind]);
  const selected = new Set(selection);
  const columns: readonly string[] =
    view === "enrichment" &&
    page?.rows.some((row) => row.supporting_samples != null)
      ? [
          ...views[view].slice(0, -1),
          "supporting_samples",
          "target_samples",
          "flags",
        ]
      : views[view];
  function choose(id: string) {
    onSelection?.(
      selected.has(id)
        ? selection.filter((value) => value !== id)
        : [...selection, id],
    );
  }
  return (
    <section className="dataset-table-region">
      <div className="dataset-table-toolbar">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={
            view === "series"
              ? zh
                ? "搜索砌块"
                : "Search building blocks"
              : zh
                ? "搜索成员或货号"
                : "Search members or IDs"
          }
          aria-label={
            view === "series"
              ? zh
                ? "搜索砌块"
                : "Search building blocks"
              : zh
                ? "搜索成员或货号"
                : "Search members or IDs"
          }
        />
        {view === "series" && (
          <label>
            {zh ? "系列类型" : "Series type"}
            <select
              value={seriesKind}
              onChange={(e) => setSeriesKind(e.target.value)}
            >
              <option value="all">{zh ? "全部系列" : "All series"}</option>
              <option value="mono">{zh ? "单砌块" : "Monosynthons"}</option>
              <option value="di">{zh ? "双砌块" : "Disynthons"}</option>
            </select>
          </label>
        )}
        {(view === "library" || view === "index") && (
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !page?.rows.length}
            onClick={() =>
              downloadBlob(
                new Blob([memberPageCsv(jobId, page!.rows)], {
                  type: "text/csv;charset=utf-8",
                }),
                "library-page.csv",
              )
            }
          >
            {zh ? "导出当前页 CSV" : "Export page CSV"}
          </button>
        )}
        {view === "enrichment" && (
          <label>
            <input
              type="checkbox"
              checked={filter}
              onChange={(e) => setFilter(e.target.checked)}
            />
            {zh ? "符合所选筛选条件" : "Selected prioritization criteria"}
          </label>
        )}
        {view === "enrichment" && (
          <Hint label={zh ? "富集与区间说明" : "Enrichment and interval help"}>
            {zh
              ? "富集是相对于所选对照的测序计数比值。区间只表示计数模型的不确定性；不代表实测亲和力或生物学重复误差。"
              : "Enrichment compares sequencing counts with the selected reference. Intervals describe count-model uncertainty, not affinity or biological replicate error."}
          </Hint>
        )}
      </div>
      {view === "counts" && (
        <p className="field-help">
          {zh
            ? "— 表示未计算或缺少可用的完整 UMI 证据，不代表零分子。"
            : "— means not calculated or insufficient complete-UMI evidence, not a zero-molecule result."}
        </p>
      )}
      <div
        className={`dataset-table-scroll dataset-${view}-table`}
        aria-busy={busy}
      >
        <table>
          <thead>
            <tr>
              {onSelection && <th aria-label={zh ? "选择" : "Select"} />}
              {columns.map((key) => (
                <th key={key} className={`dataset-column-${key}`}>
                  {labels[key]?.[zh ? 0 : 1] ?? key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page?.rows.map((row, index) => {
              const id = String(
                row.id ??
                  row.member ??
                  `${row.kind}-${row.block_a}-${row.block_b}-${index}`,
              );
              return (
                <ResultRow
                  key={`${id}-${index}`}
                  className={selected.has(id) ? "selected" : ""}
                  selected={selected.has(id)}
                  onSelect={onSelect ? () => onSelect(row) : undefined}
                >
                  {onSelection && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${zh ? "选择" : "Select"} ${row.display_name || id}`}
                        checked={selected.has(id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => choose(id)}
                      />
                    </td>
                  )}
                  {columns.map((key) => (
                    <td key={key} className={`dataset-column-${key}`}>
                      {key === "smiles" ? (
                        row.smiles ? (
                          <MoleculeImage
                            source={{ smiles: String(row.smiles) }}
                            language={language}
                            label={String(row.display_name || id)}
                            compact
                          />
                        ) : (
                          <span className="dataset-unresolved">
                            {zh ? "结构待解析" : "Unresolved"}
                          </span>
                        )
                      ) : key === "kind" &&
                        (row.kind === "mono" || row.kind === "di") ? (
                        row.kind === "mono" ? (
                          zh ? (
                            "单砌块"
                          ) : (
                            "Monosynthon"
                          )
                        ) : zh ? (
                          "双砌块"
                        ) : (
                          "Disynthon"
                        )
                      ) : key === "umi_status" ? (
                        umiStateLabel(row.umi_status, zh)
                      ) : key === "supplier" ? (
                        supplierLabel(row.supplier, zh)
                      ) : key === "flags" ? (
                        <span
                          className="dataset-evidence-notes"
                          title={evidenceNotes(row.flags, zh).join("；")}
                        >
                          {evidenceNotes(row.flags, zh).length
                            ? `${evidenceNotes(row.flags, zh).length} ${zh ? "项提示" : "notes"}`
                            : zh
                              ? "无额外提示"
                              : "No extra notes"}
                        </span>
                      ) : key === "matched" ? (
                        row.matched ? (
                          zh ? (
                            "已关联"
                          ) : (
                            "Linked"
                          )
                        ) : zh ? (
                          "尚未关联"
                        ) : (
                          "Unlinked"
                        )
                      ) : key === "unit" && row.unit === "qualitative" ? (
                        zh ? (
                          "定性报告"
                        ) : (
                          "Qualitative"
                        )
                      ) : key === "id" || key === "member" ? (
                        onSelect ? (
                          <button
                            type="button"
                            className="dataset-row-title"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect?.(row);
                            }}
                          >
                            {format(
                              key === "id"
                                ? row.display_name || row.id
                                : row[key],
                            )}
                          </button>
                        ) : (
                          <span className="dataset-row-title">
                            {format(
                              key === "id"
                                ? row.display_name || row.id
                                : row[key],
                            )}
                          </span>
                        )
                      ) : key === "value" && row.value == null ? (
                        format(row.qualifier)
                      ) : (
                        format(row[key])
                      )}
                    </td>
                  ))}
                </ResultRow>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="field-help" role="status">
          {zh ? "正在加载所选结果…" : "Loading selected results…"}
        </p>
      )}
      {page && !page.rows.length && (
        <p className="dataset-empty">
          {zh
            ? "当前筛选条件下没有成员"
            : "No members match the current criteria"}
        </p>
      )}
      <div className="dataset-table-footer">
        <span>
          {onSelection && selection.length
            ? `${zh ? "已选择" : "Selected"} ${selection.length} · `
            : ""}
          {page
            ? page.rows.length
              ? `${offset + 1}–${offset + page.rows.length}`
              : "0"
            : ""}
        </span>
        <button
          type="button"
          disabled={busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {zh ? "上一页" : "Previous"}
        </button>
        <button
          type="button"
          disabled={busy || !page?.has_more}
          onClick={() => setOffset(offset + 20)}
        >
          {zh ? "下一页" : "Next"}
        </button>
      </div>
    </section>
  );
}
