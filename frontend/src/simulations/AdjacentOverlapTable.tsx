import type { Language } from "../types";
import { downloadBlob } from "../presentation/visual-export";
import { overlapCsv, type AdjacentOverlap } from "./overlap-data";

export function AdjacentOverlapTable({
  rows,
  language,
}: {
  rows: AdjacentOverlap[];
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section className="fep-adjacent-overlap">
      <header>
        <h3>{zh ? "相邻状态" : "Adjacent states"}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            downloadBlob(
              new Blob([overlapCsv(rows)], { type: "text/csv;charset=utf-8" }),
              "adjacent-state-overlap.csv",
            )
          }
        >
          {zh ? "下载数值" : "Download values"}
        </button>
      </header>
      <div className="fep-overlap-table-scroll">
        <table>
          <caption className="sr-only">
            {zh
              ? "相邻状态的双向采样重叠"
              : "Directional adjacent-state overlap"}
          </caption>
          <thead>
            <tr>
              <th scope="col">{zh ? "状态" : "States"}</th>
              <th scope="col">{zh ? "正向 →" : "Forward →"}</th>
              <th scope="col">{zh ? "反向 ←" : "Reverse ←"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.from}>
                <th scope="row">
                  {row.from} ↔ {row.to}
                </th>
                <td title={String(row.forward)}>{row.forward.toFixed(4)}</td>
                <td title={String(row.reverse)}>{row.reverse.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-help">
        {zh
          ? "原始 MBAR 数值；正向与反向重叠可能不同。状态编号不是 λ 数值。"
          : "Native MBAR values; forward and reverse overlap can differ. State indices are not λ values."}
      </p>
    </section>
  );
}
