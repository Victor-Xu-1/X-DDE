import { useState } from "react";
import { Hint } from "../guided/Hint";
import { StructureViewer } from "../viewer/StructureViewer";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
import type { OperationResult } from "../operations/types";
import { artifactUrl } from "../api";
import { ResearchTable } from "../presentation/ResearchTable";
import { InteractionDiagram } from "../presentation/InteractionDiagram";
import { prolifContacts, type ProlifContact } from "./prolif-contacts";
import "../presentation/ensemble-results.css";
import "./interaction-results.css";

const labels: Record<string, string> = {
  hydrogen_bond: "Hydrogen bond",
  hydrophobic: "Hydrophobic contact",
  pi_stacking: "Aromatic stacking",
  salt_bridge: "Salt bridge",
};
const residueLabel = (row: ProlifContact) =>
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
    rows = data.interactions as ProlifContact[];
  let contactState: ReturnType<typeof prolifContacts>;
  try {
    contactState = prolifContacts(rows);
  } catch {
    contactState = { unavailable: true };
  }
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
            ? "表格、关系图和三维虚线来自同一份原生化学接触记录。距离与接触数量描述几何关系；本次没有计算作用能或亲和力。"
            : "The table, relationship diagram and 3D dashes use the same native chemical contact records. Distances and counts describe geometry; no energies or affinities were calculated."}
        </Hint>
      </header>
      {contactState.unavailable && (
        <p role="alert">
          {zh
            ? "原生接触坐标不可用；保留化学接触表及原始结构。"
            : "Native contact coordinates are unavailable; the chemical table and original structures remain available."}
        </p>
      )}
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
          <ResearchTable
            rows={rows}
            title={zh ? "残基化学接触" : "Residue chemical contacts"}
            language={language}
            rowId={(row) => `${residueLabel(row)}:${row.kind}`}
            selected={null}
            compare={false}
            exportName="native-chemical-contacts.csv"
            columns={[
              {
                key: "residue",
                label: zh ? "残基" : "Residue",
                value: residueLabel,
                render: (row) => (
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
                ),
              },
              {
                key: "kind",
                label: zh ? "接触类型" : "Contact type",
                value: (row) =>
                  zh ? row.label : (labels[row.kind] ?? row.kind),
              },
              {
                key: "distance",
                label: zh ? "距离 (Å)" : "Distance (Å)",
                numeric: true,
                value: (row) => row.distance,
                render: (row) => (
                  <span title={String(row.distance)}>
                    {row.distance.toFixed(2)}
                  </span>
                ),
              },
              {
                key: "occurrences",
                label: zh ? "接触数" : "Count",
                numeric: true,
                value: (row) => row.occurrences,
              },
            ]}
          />
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
            nativeInteractions={contactState.contacts}
            ligandContext={!contactState.unavailable}
          />
        ) : (
          <div className="ensemble-empty-preview" role="status">
            {zh
              ? "当前输入没有可定位的受体与分子构象。"
              : "The current inputs do not contain a receptor and molecule conformer to locate."}
          </div>
        )}
      </div>
      <InteractionDiagram
        language={language}
        label={zh ? "研究配体" : "Study ligand"}
        subjectLabel={zh ? "研究配体" : "Study ligand"}
        edges={rows.map((row) => ({
          left: zh ? "研究配体" : "Study ligand",
          right: residueLabel(row),
          kind:
            (
              {
                hydrogen_bond: "hbond",
                hydrophobic: "hydrophobic",
                pi_stacking: "pistack",
                salt_bridge: "saltbridge",
              } as Record<string, string>
            )[row.kind] ?? row.kind,
          distance: row.distance,
        }))}
      />
      <a href={artifactUrl(job.id, "interactions.json")} download>
        {zh ? "下载原生接触记录" : "Download native contact records"}
      </a>
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
