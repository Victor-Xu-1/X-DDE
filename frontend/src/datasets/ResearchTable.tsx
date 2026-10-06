import { useEffect, useState } from "react";
import { request } from "../api";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { Hint } from "../guided/Hint";
import type { Language } from "../types";

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
  replicate_cv: ["重复差异", "Replicate CV"],
  sample: ["样本", "Sample"],
  raw: ["读段", "Reads"],
  unique_umi: ["独立 UMI", "Unique UMIs"],
  corrected_umi: ["纠错 UMI", "Corrected UMIs"],
  kind: ["系列", "Series"],
  block_a: ["砌块 A", "Block A"],
  block_b: ["砌块 B", "Block B"],
  members: ["观察成员", "Observed members"],
  endpoint: ["测量指标", "Endpoint"],
  unit: ["单位", "Unit"],
  value: ["报告值", "Reported value"],
  matched: ["关联原成员", "Linked member"],
};
const views = {
  library: ["id", "smiles", "mw", "logp", "tpsa", "qed", "offers"],
  enrichment: [
    "member",
    "smiles",
    "selection",
    "reference",
    "score",
    "lower",
    "upper",
    "replicate_cv",
  ],
  counts: ["member", "sample", "raw", "unique_umi", "corrected_umi"],
  series: [
    "kind",
    "block_a",
    "block_b",
    "members",
    "selection",
    "reference",
    "score",
  ],
  followup: ["member", "endpoint", "unit", "value", "matched"],
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
}: {
  jobId: string;
  view: keyof typeof views;
  comparison?: string;
  language: Language;
  onSelect?(row: TableRow): void;
  onSelection?(ids: string[]): void;
  selection?: string[];
}) {
  const zh = language === "zh",
    [page, setPage] = useState<Page | null>(null),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setOffset(0);
  }, [jobId, view, comparison, search, filter]);
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError("");
    const path =
      view === "library"
        ? `/datasets/${jobId}/members`
        : `/datasets/${jobId}/table`;
    const params = new URLSearchParams({
      limit: "20",
      offset: String(offset),
      search,
      ...(view === "library"
        ? {}
        : { view, comparison, prioritized: String(filter) }),
    });
    void request<Page>(`${path}?${params}`, { signal: c.signal })
      .then((value) => {
        if (!c.signal.aborted) setPage(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [jobId, view, comparison, offset, search, filter]);
  const selected = new Set(selection);
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
          placeholder={zh ? "搜索成员或货号" : "Search members or IDs"}
          aria-label={zh ? "搜索成员或货号" : "Search members or IDs"}
        />
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
      <div className="dataset-table-scroll" aria-busy={busy}>
        <table>
          <thead>
            <tr>
              {onSelection && <th aria-label={zh ? "选择" : "Select"} />}{" "}
              {views[view].map((key) => (
                <th key={key}>{labels[key]?.[zh ? 0 : 1] ?? key}</th>
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
                <tr
                  key={`${id}-${index}`}
                  className={selected.has(id) ? "selected" : ""}
                  onClick={() => onSelect?.(row)}
                >
                  {onSelection && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${zh ? "选择" : "Select"} ${id}`}
                        checked={selected.has(id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => choose(id)}
                      />
                    </td>
                  )}
                  {views[view].map((key) => (
                    <td key={key}>
                      {key === "smiles" ? (
                        row.smiles ? (
                          <MoleculeImage
                            source={{ smiles: String(row.smiles) }}
                            language={language}
                            label={id}
                            compact
                          />
                        ) : (
                          <span className="dataset-unresolved">
                            {zh ? "结构待解析" : "Unresolved"}
                          </span>
                        )
                      ) : key === "id" || key === "member" ? (
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
                        format(row[key])
                      )}
                    </td>
                  ))}
                </tr>
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
          {page ? `${offset + 1}–${offset + page.rows.length}` : ""}
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
