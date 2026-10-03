import { useState } from "react";
import type { Job, Language } from "../types";
import { ResultTree } from "./StructuredResults";
import { StructureViewer } from "../viewer/StructureViewer";
import { harnessSource } from "../presentation/task-sources";
interface ContactResidue {
  chain: string;
  residue_id: number;
  residue_name: string;
  contacts: number;
}
export function EpitopeResults({
  job,
  value,
  language,
}: {
  job: Job;
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh",
    rows = Array.isArray(value.epitope_residues)
      ? (value.epitope_residues as ContactResidue[])
      : [];
  const protein = rows.filter(
    (r) => !["HOH", "WAT", "H2O", "DOD"].includes(r.residue_name),
  );
  const water = rows.length - protein.length,
    top = [...protein].sort((a, b) => b.contacts - a.contacts).slice(0, 5);
  const source = harnessSource(job, "structure_path"),
    [focus, setFocus] = useState<{ residue: string; nonce: number } | null>(
      null,
    );
  return (
    <section>
      <h3>
        {zh ? "蛋白接触残基" : "Protein contact residues"}: {protein.length}
      </h3>
      <p className="field-help">
        {zh
          ? "按接触数量展示前 5 个残基；这是结构近接信息，不是药效重要性排名。"
          : "The 5 residues with the most contacts are shown; this is structural proximity, not a pharmacological importance ranking."}
        {water > 0 &&
          (zh
            ? " 原始结果另含 " + water + " 个结构水条目。"
            : " Native results also include " +
              water +
              " structural-water entries.")}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{zh ? "残基" : "Residue"}</th>
              <th>{zh ? "接触数量" : "Contact count"}</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={i}>
                <th>
                  <button
                    type="button"
                    onClick={() =>
                      setFocus({
                        residue: r.chain + ":" + r.residue_name + r.residue_id,
                        nonce: Date.now(),
                      })
                    }
                  >
                    {r.chain}:{r.residue_name}
                    {r.residue_id}
                  </button>
                </th>
                <td>{r.contacts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {source && (
        <StructureViewer
          urls={["/api/assets/" + source.asset_id]}
          language={language}
          focusResidue={focus}
        />
      )}
      <details>
        <summary>
          {zh ? "全部接触与 CDR 贡献" : "All contacts & CDR contributions"}
        </summary>
        <ResultTree value={value} zh={zh} />
      </details>
    </section>
  );
}
