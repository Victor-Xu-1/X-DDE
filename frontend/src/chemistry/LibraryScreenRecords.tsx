import { useLayoutEffect, useRef } from "react";
import type { Language } from "../types";
import { screenReason, type ScreenRow } from "./screen-types";

export function LibraryScreenRecords({
  rows,
  selected,
  language,
  onSelect,
}: {
  rows: readonly ScreenRow[];
  selected: number;
  language: Language;
  onSelect(id: number): void;
}) {
  const zh = language === "zh";
  const scroll = useRef<HTMLDivElement>(null);
  const first = rows[0]?.record;
  useLayoutEffect(() => {
    const area = scroll.current;
    const row = area?.querySelector("tr[data-selected]");
    if (!area || !row) return;
    const viewport = area.getBoundingClientRect();
    const header =
      area.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const active = row.getBoundingClientRect();
    const top = viewport.top + header;
    if (active.top < top) area.scrollTop += active.top - top;
    else if (active.bottom > viewport.bottom)
      area.scrollTop += active.bottom - viewport.bottom;
  }, [first, selected]);
  return (
    <div
      className="table-scroll library-screen-records"
      ref={scroll}
      role="region"
      aria-label={zh ? "可滚动的筛选记录" : "Scrollable screening records"}
      tabIndex={0}
    >
      <table aria-label={zh ? "筛选条目" : "Screening records"}>
        <thead>
          <tr>
            <th scope="col">{zh ? "记录" : "Record"}</th>
            <th scope="col">MW</th>
            <th scope="col">LogP</th>
            <th scope="col">{zh ? "依据" : "Evidence"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.record}
              data-selected={selected === row.record || undefined}
            >
              <th scope="row">
                <button
                  className="text-button library-screen-record"
                  type="button"
                  aria-label={`${zh ? "原始分子" : "Input molecule"} #${row.record + 1}`}
                  aria-pressed={selected === row.record}
                  onClick={() => onSelect(row.record)}
                >
                  #{row.record + 1}
                </button>
              </th>
              <td>{row.descriptors?.mw.toFixed(1) ?? "—"}</td>
              <td>{row.descriptors?.logp.toFixed(2) ?? "—"}</td>
              <td>
                <span title={screenReason(row, zh) ?? undefined}>
                  {selectionEvidence(row, zh)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function selectionEvidence(row: ScreenRow, zh: boolean) {
  if (row.similarity != null) return row.similarity.toFixed(3);
  if (row.substructure_match != null)
    return row.substructure_match
      ? zh
        ? "匹配片段"
        : "Match"
      : zh
        ? "不匹配"
        : "No match";
  if (row.selected) return zh ? "已选中" : "Selected";
  if (row.reason_code === "duplicate") return zh ? "重复" : "Duplicate";
  if (!row.available) return zh ? "不可用" : "Unavailable";
  return zh ? "未选中" : "Not selected";
}
