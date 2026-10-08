import { useState } from "react";
import { Hint } from "../guided/Hint";
import { StructureViewer } from "../viewer/StructureViewer";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import "../presentation/ensemble-results.css";
import "./interaction-results.css";

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
const residueLabel = (row: Interaction) =>
  row.residue.chain +
  ":" +
  row.residue.name +
  row.residue.number +
  (row.residue.insertion_code ?? "");

export function InteractionResults({
  job,
  data,
  language,
}: {
  job: Job;
  data: OperationResult;
  language: Language;
}) {
  const zh = language === "zh",
    rows = data.interactions as Interaction[];
  const [focus, setFocus] = useState<{ residue: string; nonce: number } | null>(
    null,
  );
  const payload: Record<string, unknown> =
    job.request.operation === "diffsbdd" ? job.request.payload : {};
  const protein = payload.protein as MoleculeRef | undefined,
    molecule = payload.molecule as MoleculeRef | undefined;
  const canLocate = Boolean(
    protein && molecule && protein.conformer === 0 && molecule.conformer === 0,
  );
  return (
    <section
      className="interaction-results"
      aria-label={zh ? "分子相互作用结果" : "Molecular interaction results"}
    >
      <header className="ensemble-result-heading">
        <h3>
          {zh ? "残基接触" : "Residue contacts"}{" "}
          <span className="ensemble-count">{rows.length}</span>
        </h3>
        <Hint label={zh ? "接触分析说明" : "Contact analysis help"}>
          {zh
            ? "接触类型来自本次化学分析。距离与接触数量不是作用能或亲和力；三维虚线中的几何近接使用单独的距离规则。"
            : "Contact types come from this chemical analysis. Distances and counts are not energy or affinity; geometric proximity in the 3D view follows a separate distance rule."}
        </Hint>
      </header>
      {!rows.length && (
        <p role="status">
          {zh
            ? "本次分析未识别到接触。"
            : "No contacts were identified in this analysis."}
        </p>
      )}
      <div className="ensemble-result-layout">
        <div className="interaction-contact-list">
          <header className="ensemble-result-heading">
            <h3>{zh ? "选择残基" : "Select a residue"}</h3>
          </header>
          <div
            className="interaction-contact-table"
            role="region"
            tabIndex={0}
            aria-label={zh ? "化学接触明细" : "Chemical contact details"}
          >
            <table
              aria-label={zh ? "残基化学接触" : "Residue chemical contacts"}
            >
              <thead>
                <tr>
                  {(zh
                    ? ["残基", "接触类型", "距离 (Å)", "接触数"]
                    : ["Residue", "Contact type", "Distance (Å)", "Count"]
                  ).map((title) => (
                    <th key={title} scope="col">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    className={
                      focus?.residue === residueLabel(row)
                        ? "is-selected"
                        : undefined
                    }
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className="result-row-button"
                        disabled={!canLocate}
                        aria-pressed={focus?.residue === residueLabel(row)}
                        onClick={() =>
                          setFocus((previous) => ({
                            residue: residueLabel(row),
                            nonce: (previous?.nonce ?? 0) + 1,
                          }))
                        }
                      >
                        {residueLabel(row)}
                      </button>
                    </th>
                    <td>
                      {zh
                        ? row.label
                        : (labels[row.kind] ?? row.kind.replaceAll("_", " "))}
                    </td>
                    <td
                      title={
                        Number.isFinite(row.distance)
                          ? String(row.distance)
                          : undefined
                      }
                    >
                      {Number.isFinite(row.distance)
                        ? row.distance.toFixed(2)
                        : "—"}
                    </td>
                    <td>{row.occurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {canLocate && protein && molecule ? (
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
        ) : (
          <div className="ensemble-empty-preview" role="status">
            {zh
              ? "当前输入没有可定位的受体与分子构象。"
              : "The current inputs do not contain a receptor and molecule conformer to locate."}
          </div>
        )}
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
