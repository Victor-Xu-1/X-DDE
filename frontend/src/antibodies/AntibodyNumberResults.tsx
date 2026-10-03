import "./antibodies.css";
import { useState } from "react";
import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import type { Job, Language, Prediction } from "../types";
import type { AntibodyNumberResult } from "./types";

export function AntibodyNumberResults({
  job,
  result,
  language,
  onDraft,
}: {
  job: Job;
  result: AntibodyNumberResult;
  language: Language;
  onDraft?(draft: Prediction): void;
}) {
  const zh = language === "zh",
    [index, setIndex] = useState(0),
    domain = result.domains[index];
  return (
    <div className="discovery-results">
      <label className="field">
        {zh ? "查看哪个输入/结构域？" : "Which input/domain?"}
        <select
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {result.domains.map((row, i) => (
            <option value={i} key={row.id}>
              {row.id} ·{" "}
              {row.available
                ? (row.chain_type ?? "—")
                : zh
                  ? "未能编号"
                  : "Unnumbered"}
            </option>
          ))}
        </select>
      </label>
      {domain?.available ? (
        <>
          <p>
            {domain.chain_type === "H"
              ? zh
                ? "重链型"
                : "Heavy-chain type"
              : domain.chain_type === "K"
                ? zh
                  ? "κ轻链型"
                  : "Kappa-chain type"
                : zh
                  ? "λ轻链型"
                  : "Lambda-chain type"}{" "}
            · {zh ? "原始序列位置" : "Original positions"}{" "}
            {(domain.start ?? 0) + 1}–{(domain.end ?? 0) + 1}
          </p>
          <div
            className="antibody-sequence"
            aria-label={zh ? "抗体编号残基" : "Numbered antibody residues"}
          >
            {domain.numbering.map((row) => (
              <span
                key={row.number + row.insertion}
                className={row.region === "framework" ? "framework" : "cdr"}
                title={`${row.region} · IMGT ${row.number}${row.insertion} · ${zh ? "原始位置" : "Source position"} ${row.source_position}`}
              >
                {row.amino_acid}
              </span>
            ))}
          </div>
          <div className="table-scroll">
            <table>
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
                  return (
                    <tr key={region}>
                      <td>{region}</td>
                      <td className="result-value">
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
          <details>
            <summary>
              {zh ? "完整 IMGT 编号" : "Complete IMGT numbering"}
            </summary>
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
                  {domain.numbering.map((row) => (
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
        </>
      ) : (
        <p role="status">
          {zh
            ? "此输入未能完成抗体编号。可检查序列和分子形式，失败原因已保留在完整结果中。"
            : "This input could not be numbered. Check the sequence and format; the reason is retained in the full result."}
          <small title={domain?.reason ?? undefined}>{domain?.reason}</small>
        </p>
      )}
    </div>
  );
}
