import { useState } from "react";
import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { artifactUrl } from "../api";
import { ResultTree } from "../operations/StructuredResults";
interface Interaction {
  label: string;
  kind: string;
  residue: {
    chain: string;
    name: string;
    number: number;
    insertion_code: string;
  };
  distance: number;
  occurrences: number;
}
const labels: Record<string, string> = {
  hydrogen_bond: "Hydrogen bond",
  hydrophobic: "Hydrophobic contact",
  pi_stacking: "Aromatic stacking",
  salt_bridge: "Salt bridge",
};
export function ScientificDetails({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh",
    mode = String(data.mode ?? "");
  const [focus, setFocus] = useState<{ residue: string; nonce: number } | null>(
    null,
  );
  if (mode === "interactions" && Array.isArray(data.interactions)) {
    const rows = data.interactions as Interaction[];
    const payload: Record<string, unknown> =
      job.request.operation === "diffsbdd" ? job.request.payload : {};
    const protein = payload.protein as MoleculeRef | undefined,
      molecule = payload.molecule as MoleculeRef | undefined;
    return (
      <section className="interaction-results">
        <h3>
          {zh
            ? "识别到 " + rows.length + " 类残基接触"
            : rows.length + " residue contact types identified"}
        </h3>
        <p className="field-help">
          {zh
            ? "选择残基可定位。距离与接触数量不是作用能或亲和力。"
            : "Select a residue to locate it. Distance and contact count are not energy or affinity."}
        </p>
        {protein &&
          molecule &&
          protein.conformer === 0 &&
          molecule.conformer === 0 && (
            <StructureViewer
              urls={[
                "/api/assets/" + protein.asset_id,
                "/api/assets/" + molecule.asset_id,
              ]}
              records={[protein.record, molecule.record]}
              focusModel={1}
              focusResidue={focus}
              language={language}
            />
          )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(zh
                  ? ["受体残基", "接触类型", "距离（Å）", "接触数量"]
                  : [
                      "Receptor residue",
                      "Contact type",
                      "Distance (Å)",
                      "Contact count",
                    ]
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <tr key={i}>
                  <th>
                    <button
                      type="button"
                      onClick={() =>
                        setFocus({
                          residue:
                            v.residue.chain +
                            ":" +
                            v.residue.name +
                            v.residue.number +
                            (v.residue.insertion_code ?? ""),
                          nonce: Date.now(),
                        })
                      }
                    >
                      {v.residue.chain}:{v.residue.name}
                      {v.residue.number}
                      {v.residue.insertion_code}
                    </button>
                  </th>
                  <td>
                    {zh
                      ? v.label
                      : (labels[v.kind] ?? v.kind.replaceAll("_", " "))}
                  </td>
                  <td>
                    {Number.isFinite(v.distance) ? v.distance.toFixed(2) : "—"}
                  </td>
                  <td>{v.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>{zh ? "分析方法与适用范围" : "Method & scope"}</summary>
          <p>{String(data.engine ?? "ProLIF")}</p>
          <p>{String(data.note ?? "")}</p>
          {typeof data.criteria_source === "string" && (
            <a href={data.criteria_source} target="_blank" rel="noreferrer">
              {zh ? "方法说明" : "Method documentation"}
            </a>
          )}
        </details>
      </section>
    );
  }
  if (mode === "pocket")
    return (
      <section>
        <h3>
          {zh ? "口袋包含的残基" : "Residues in the pocket"}:{" "}
          {String(data.residue_count ?? "—")}
        </h3>
        {typeof data.pocket_artifact === "string" && (
          <StructureViewer
            urls={[artifactUrl(job.id, data.pocket_artifact)]}
            language={language}
          />
        )}
        <details>
          <summary>{zh ? "查看口袋残基" : "Inspect pocket residues"}</summary>
          <ResultTree value={data.residues} zh={zh} />
        </details>
      </section>
    );
  if (mode === "prepare")
    return (
      <section>
        <dl className="native-result-metrics">
          {["input_atoms", "output_atoms", "removed_atoms"].map(
            (k, i) =>
              typeof data[k] === "number" && (
                <div key={k}>
                  <dt>
                    {
                      (zh
                        ? ["原始原子", "保留原子", "移除原子"]
                        : ["Input atoms", "Retained atoms", "Removed atoms"])[i]
                    }
                  </dt>
                  <dd>{String(data[k])}</dd>
                </div>
              ),
          )}
        </dl>
        {typeof data.structure === "string" && (
          <a
            className="research-download"
            href={artifactUrl(job.id, data.structure)}
            download
          >
            {zh ? "下载准备好的受体" : "Download prepared receptor"}
          </a>
        )}
      </section>
    );
  return null;
}
