import type { Language } from "../types";
import type { NumberedResidue } from "./types";

export function AntibodyNumberingTable({
  numbering,
  language,
}: {
  numbering: readonly NumberedResidue[];
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <details>
      <summary>{zh ? "完整 IMGT 编号" : "Complete IMGT numbering"}</summary>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{zh ? "IMGT 编号" : "IMGT position"}</th>
              <th>{zh ? "原始序列位置" : "Source sequence position"}</th>
              <th>{zh ? "氨基酸" : "Amino acid"}</th>
              <th>{zh ? "区域" : "Region"}</th>
            </tr>
          </thead>
          <tbody>
            {numbering.map((row) => (
              <tr key={row.number + row.insertion}>
                <td>
                  {row.number}
                  {row.insertion}
                </td>
                <td>{row.source_position}</td>
                <td>{row.amino_acid}</td>
                <td>
                  {row.region === "framework"
                    ? zh
                      ? "框架"
                      : "Framework"
                    : row.region}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
