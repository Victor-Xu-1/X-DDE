import { useState, type ReactNode } from "react";
import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import { Hint } from "../guided/Hint";
import { SequenceTrack } from "../presentation/SequenceTrack";
import type { Job, Language, Prediction } from "../types";
import { numberedRegions } from "./numbered-regions";
import { AntibodyNumberingTable } from "./AntibodyNumberingTable";
import type { Domain } from "./types";

export function AntibodyDomainDetail({
  selector,
  job,
  domain,
  source,
  language,
  onDraft,
}: {
  selector: ReactNode;
  job: Job;
  domain: Domain;
  source?: { id: string; sequence: string };
  language: Language;
  onDraft?(draft: Prediction): void;
}) {
  const zh = language === "zh",
    [position, setPosition] = useState<number | null>(null);
  const chainNames = {
    H: zh ? "重链型" : "Heavy-chain type",
    K: zh ? "κ轻链型" : "Kappa-chain type",
    L: zh ? "λ轻链型" : "Lambda-chain type",
  };
  const chain =
    domain.chain_type && domain.chain_type !== "F"
      ? chainNames[domain.chain_type]
      : zh
        ? "链型未确定"
        : "Chain type not established";
  return (
    <>
      <div className="result-inspection">
        <div className="result-inspection-list">
          {selector}
          <div className="result-inspection-heading">
            <h3>{zh ? "已编号可变域" : "Numbered variable domain"}</h3>
            <span className="result-inspection-count">
              {domain.numbering.length} aa · {chain}
            </span>
          </div>
          <p className="field-help">
            {zh ? "原始序列位置" : "Original positions"}{" "}
            {domain.start == null ? "—" : domain.start + 1}–
            {domain.end == null ? "—" : domain.end + 1}
          </p>
          <div className="table-scroll antibody-cdr-table">
            <table aria-label={zh ? "CDR 区域" : "CDR regions"}>
              <thead>
                <tr>
                  <th>{zh ? "区域" : "Region"}</th>
                  <th>{zh ? "序列" : "Sequence"}</th>
                  <th>{zh ? "原始位置" : "Original positions"}</th>
                </tr>
              </thead>
              <tbody>
                {(["CDR1", "CDR2", "CDR3"] as const).map((region) => {
                  const rows = domain.numbering.filter(
                    (row) => row.region === region,
                  );
                  const selected = rows.some(
                    (row) => row.source_position === position,
                  );
                  return (
                    <tr key={region} className={selected ? "is-selected" : ""}>
                      <td>
                        <button
                          type="button"
                          className="cdr-select"
                          disabled={!rows.length}
                          aria-pressed={selected}
                          onClick={() => setPosition(rows[0].source_position)}
                        >
                          {region}
                        </button>
                      </td>
                      <td className="sequence-cell">
                        {rows.map((row) => row.amino_acid).join("") || "—"}
                      </td>
                      <td>
                        {rows.length
                          ? `${rows[0].source_position}–${rows.at(-1)!.source_position}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="result-inspection-actions">
            {domain.artifact && (
              <a href={artifactUrl(job.id, domain.artifact)} download>
                {zh ? "下载这个域的序列" : "Download this domain sequence"}
              </a>
            )}
            {domain.reference && domain.sequence && onDraft && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  onDraft({
                    name: domain.id.slice(0, 80),
                    components: [
                      {
                        kind: "protein",
                        value: domain.sequence!,
                        count: 1,
                        source_sequence: domain.reference!.asset_id,
                      },
                    ],
                    scientific_inputs: [domain.reference!],
                    parameters: { ...defaults },
                  })
                }
              >
                {zh ? "用这个域预测结构" : "Predict this domain structure"}
              </button>
            )}
          </div>
          <Hint
            label={
              zh
                ? "CDR 位置与 IMGT 编号说明"
                : "CDR positions and IMGT numbering help"
            }
          >
            {zh
              ? "点击 CDR 定位到完整输入序列。原始位置以输入序列为准；IMGT 编号可包含插入码，仅覆盖已识别的可变域。域的 FASTA 和完整输入序列分别下载。"
              : "Select a CDR to locate it in the full input sequence. Source positions refer to that input; IMGT numbering may include insertion codes and covers the recognized variable domain only. Domain FASTA and full input FASTA are separate downloads."}
          </Hint>
        </div>
        <div className="result-inspection-detail">
          {source ? (
            <SequenceTrack
              sequence={source.sequence}
              language={language}
              label={
                (zh ? "完整输入序列 · " : "Full input sequence · ") + source.id
              }
              regions={numberedRegions(domain.numbering)}
              selectedPosition={position}
              onSelect={setPosition}
            />
          ) : (
            <div
              className="antibody-sequence"
              aria-label={zh ? "抗体编号残基" : "Numbered antibody residues"}
            >
              {domain.numbering.map((row) => (
                <button
                  type="button"
                  key={row.number + row.insertion}
                  className={row.region === "framework" ? "framework" : "cdr"}
                  aria-pressed={position === row.source_position}
                  onClick={() => setPosition(row.source_position)}
                  title={`${row.region} · IMGT ${row.number}${row.insertion} · ${zh ? "原始位置" : "Source position"} ${row.source_position}`}
                >
                  {row.amino_acid}
                </button>
              ))}
            </div>
          )}
          {position != null && !source && (
            <p>
              {zh ? "原始位置 " : "Source position "}
              {position}
            </p>
          )}
        </div>
      </div>
      <AntibodyNumberingTable
        numbering={domain.numbering}
        language={language}
      />
    </>
  );
}
