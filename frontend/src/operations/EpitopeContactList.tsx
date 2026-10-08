import { useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import type { Language } from "../types";
import { Hint } from "../guided/Hint";
import { csvCell } from "../presentation/table-model";
import { downloadBlob } from "../presentation/visual-export";
import { contactLabel, type ContactResidue } from "./epitope-contacts";

export function EpitopeContactList({
  protein,
  water,
  language,
  selected,
  onSelect,
}: {
  protein: readonly ContactResidue[];
  water: number;
  language: Language;
  selected: string | null;
  onSelect?: (residue: string) => void;
}) {
  const zh = language === "zh";
  const [limit, setLimit] = useState("5");
  const shown = limit === "all" ? protein : protein.slice(0, Number(limit));
  const max = Math.max(1, ...protein.map((row) => row.contacts));
  function exportContacts() {
    const header = ["chain", "residue_name", "residue_id", "contacts"];
    const body = protein.map((row) =>
      [row.chain, row.residue_name, row.residue_id, row.contacts]
        .map(csvCell)
        .join(","),
    );
    downloadBlob(
      new Blob(["\uFEFF", header.join(","), "\r\n", body.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
      "protein-contacts.csv",
    );
  }
  return (
    <section
      className="epitope-contact-list"
      aria-label={zh ? "接触残基列表" : "Contact residue list"}
    >
      <header className="epitope-contact-heading">
        <h3>
          {zh ? "蛋白接触残基" : "Protein contact residues"}: {protein.length}
        </h3>
        <Hint label={zh ? "接触数量说明" : "Contact count help"}>
          {zh
            ? "按接触数量排列；反映结构近接，不代表作用力、结合能或药效重要性。"
            : "Ordered by contact count: structural proximity, not interaction strength, binding energy or pharmacological importance."}
          {water > 0 &&
            (zh
              ? ` 原始结果另含 ${water} 个结构水条目。`
              : ` Native results also contain ${water} structural-water entries.`)}
        </Hint>
      </header>
      <div className="epitope-contact-actions">
        <label>
          {zh ? "显示残基" : "Show residues"}
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          >
            <option value="3">{zh ? "前 3 个" : "Top 3"}</option>
            <option value="5">{zh ? "前 5 个" : "Top 5"}</option>
            <option value="all">{zh ? "全部" : "All"}</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={exportContacts}
          disabled={!protein.length}
        >
          <DownloadOutlined aria-hidden="true" />
          {zh ? "下载表格" : "Download table"}
        </button>
      </div>
      {protein.length ? (
        <div className="epitope-contact-scroll table-scroll">
          <table aria-label={zh ? "蛋白接触残基" : "Protein contact residues"}>
            <thead>
              <tr>
                <th>{zh ? "残基" : "Residue"}</th>
                <th>{zh ? "接触数量" : "Contact count"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const label = contactLabel(row);
                return (
                  <tr
                    key={`${label}:${index}`}
                    data-selected={selected === label || undefined}
                  >
                    <th scope="row">
                      {onSelect ? (
                        <button
                          type="button"
                          className="epitope-residue-button"
                          aria-pressed={selected === label}
                          title={
                            zh
                              ? "点击在三维结构中定位"
                              : "Locate in the 3D structure"
                          }
                          onClick={() => onSelect(label)}
                        >
                          {label}
                        </button>
                      ) : (
                        <span>{label}</span>
                      )}
                    </th>
                    <td>
                      <span className="epitope-count">
                        <i aria-hidden="true">
                          <span
                            style={{ width: `${(row.contacts / max) * 100}%` }}
                          />
                        </i>
                        <span>{row.contacts}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status" className="field-help">
          {zh
            ? "此结果没有蛋白接触残基。"
            : "No protein contact residues in this result."}
        </p>
      )}
      {onSelect && protein.length > 0 && (
        <p className="field-help epitope-contact-help">
          {zh
            ? "点击残基，在结构中定位。"
            : "Select a residue to locate it in the structure."}
        </p>
      )}
    </section>
  );
}
