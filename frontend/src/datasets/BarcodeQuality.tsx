import { downloadBlob } from "../presentation/visual-export";
import type { Language } from "../types";
import {
  barcodeQualityCsv,
  barcodeSeparation,
  type BarcodeCycleQuality,
} from "./barcode-quality";

const labels = {
  separated: ["可区分", "Separated"],
  incomplete: ["检查未完成", "Review incomplete"],
  unassessed: ["未评估", "Not evaluated"],
  review: ["需要复核", "Needs review"],
} as const;

export function BarcodeQuality({
  jobId,
  cycles,
  language,
}: {
  jobId: string;
  cycles: BarcodeCycleQuality[];
  language: Language;
}) {
  const zh = language === "zh",
    title = zh ? "条码区分与结构检查" : "Barcode and structure checks";
  const number = (value: number | null | undefined) =>
    value == null ? "—" : value.toLocaleString();
  return (
    <section className="dataset-table-region">
      <div className="dataset-table-toolbar">
        <h3>{title}</h3>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            downloadBlob(
              new Blob([barcodeQualityCsv(jobId, cycles)], {
                type: "text/csv;charset=utf-8",
              }),
              "DEL-barcode-checks.csv",
            )
          }
        >
          {zh ? "导出质控表" : "Export checks"}
        </button>
      </div>
      <div
        className="dataset-table-scroll"
        role="region"
        aria-label={title}
        tabIndex={0}
      >
        <table aria-label={title}>
          <thead>
            <tr>
              <th scope="col">{zh ? "砌块周期" : "Cycle"}</th>
              <th scope="col">{zh ? "有效结构" : "Valid structures"}</th>
              <th scope="col">
                {zh ? "最少碱基差异" : "Min. base differences"}
              </th>
              <th scope="col">
                {zh ? "已比较条码对" : "Barcode pairs checked"}
              </th>
              <th scope="col">{zh ? "单处替换区分" : "Single substitution"}</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((row) => {
              const pairs =
                row.barcodes == null
                  ? null
                  : (row.barcodes * (row.barcodes - 1)) / 2;
              return (
                <tr key={row.set}>
                  <th scope="row">{row.set}</th>
                  <td>
                    {number(row.valid_structures)} / {number(row.members)}
                  </td>
                  <td>{number(row.minimum_observed_hamming_distance)}</td>
                  <td>
                    {number(row.pair_checks)} / {number(pairs)}
                  </td>
                  <td>{labels[barcodeSeparation(row)][zh ? 0 : 1]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="compact-help">
        {zh
          ? "这里只比较固定长度条码的碱基替换差异；插入和缺失错误不在这项检查范围内。"
          : "This check compares substitutions in fixed-length barcodes; insertion and deletion errors are not assessed."}
      </p>
    </section>
  );
}
