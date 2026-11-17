import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { useState } from "react";
import type { Job, Language } from "../types";
import { ResultTree } from "./StructuredResults";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SceneInfo } from "../viewer/protocol";
import { harnessSource } from "../presentation/task-sources";
import { interactionResidueKey } from "../integrations/interaction-residue";
import {
  contactLabel,
  contactRecords,
  proteinContacts,
  type ContactResidue,
} from "./epitope-contacts";
import { EpitopeContactList } from "./EpitopeContactList";
import "../integrations/interaction-workspace.css";
import "./epitope.css";

export function EpitopeResults({
  job,
  value,
  language,
}: {
  job: Job;
  value: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh";
  const source = harnessSource(job, "structure_path");
  let rows;
  try {
    rows = contactRecords(value.epitope_residues);
  } catch {
    return (
      <p role="alert" className="error-box">
        {zh
          ? "接触结果不完整，暂时无法显示残基。请查看原始结果文件。"
          : "The contact records are incomplete. Check the original result file."}
      </p>
    );
  }
  const details = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "epitope_residues"),
  );
  return (
    <EpitopeWorkspace
      key={JSON.stringify([job.id, source])}
      source={source}
      rows={rows}
      details={details}
      language={language}
    />
  );
}

function EpitopeWorkspace({
  source,
  rows,
  details,
  language,
}: {
  source: ReturnType<typeof harnessSource>;
  rows: ContactResidue[];
  details: Record<string, unknown>;
  language: Language;
}) {
  const zh = language === "zh";
  const protein = proteinContacts(rows);
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [sequenceHost, setSequenceHost] = useState<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState<{
    label: string;
    residue: string;
    nonce: number;
  } | null>(null);
  function keyFor(row: ContactResidue) {
    return (
      scene &&
      interactionResidueKey(
        { chain: row.chain, residue: row.residue_name, number: row.residue_id },
        scene.residues,
      )
    );
  }
  return (
    <section
      className={"epitope-results" + (source ? " contact-workspace" : "")}
      aria-label={zh ? "表位接触结果" : "Epitope contact results"}
    >
      <StructureWorkbench
        sequenceHostRef={source ? setSequenceHost : undefined}
        preview={
          source && (
            <div className="epitope-contact-map">
              <StructureViewer
                sourceSnapshot
                urls={["/api/assets/" + source.asset_id]}
                expectedStructureSha256={source.sha256}
                language={language}
                initialMode="cartoon"
                ligandContext={false}
                focusResidue={focus}
                sequenceHost={sequenceHost}
                onSceneLoaded={setScene}
                onStructureVerification={(verified) => {
                  if (!verified) {
                    setScene(null);
                    setFocus(null);
                  }
                }}
              />
            </div>
          )
        }
      >
        <EpitopeContactList
          protein={protein}
          water={rows.length - protein.length}
          language={language}
          selected={focus?.label ?? null}
          canSelect={(row) => Boolean(keyFor(row))}
          onSelect={
            source
              ? (row) => {
                  const residue = keyFor(row);
                  if (!residue) return;
                  setFocus((previous) => ({
                    label: contactLabel(row),
                    residue,
                    nonce: (previous?.nonce ?? 0) + 1,
                  }));
                }
              : undefined
          }
        />
      </StructureWorkbench>
      {Object.keys(details).length > 0 && (
        <details className="epitope-analysis-details">
          <summary>
            {zh ? "CDR 与接触分析明细" : "CDR and contact analysis details"}
          </summary>
          <ResultTree value={details} zh={zh} />
        </details>
      )}
    </section>
  );
}
