import { useState } from "react";
import type { Job, Language } from "../types";
import { ResultTree } from "./StructuredResults";
import { StructureViewer } from "../viewer/StructureViewer";
import { harnessSource } from "../presentation/task-sources";
import { contactRecords, proteinContacts } from "./epitope-contacts";
import { EpitopeContactList } from "./EpitopeContactList";
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
  const sourceKey = `${job.id}:${source?.asset_id ?? ""}`;
  const [focus, setFocus] = useState<{
    source: string;
    residue: string;
    nonce: number;
  } | null>(null);
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
  const protein = proteinContacts(rows);
  const selected = focus?.source === sourceKey ? focus : null;
  const details = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "epitope_residues"),
  );
  return (
    <section
      className="epitope-results"
      aria-label={zh ? "表位接触结果" : "Epitope contact results"}
    >
      <div
        className={source ? "epitope-contact-layout" : "epitope-contact-list"}
      >
        <EpitopeContactList
          key={sourceKey}
          protein={protein}
          water={rows.length - protein.length}
          language={language}
          selected={selected?.residue ?? null}
          onSelect={
            source
              ? (residue) =>
                  setFocus((previous) => ({
                    source: sourceKey,
                    residue,
                    nonce: (previous?.nonce ?? 0) + 1,
                  }))
              : undefined
          }
        />
        {source && (
          <div className="epitope-contact-map">
            <StructureViewer
              key={sourceKey}
              urls={["/api/assets/" + source.asset_id]}
              language={language}
              initialMode="cartoon"
              ligandContext={false}
              focusResidue={selected}
            />
          </div>
        )}
      </div>
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
