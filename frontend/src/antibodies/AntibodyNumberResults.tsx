import "./antibodies.css";
import { useState } from "react";
import { artifactUrl } from "../api";
import { defaults } from "../form-model";
import { Hint } from "../guided/Hint";
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
          <Hint
            label={zh ? "如何理解模型分数？" : "How to read the model score?"}
          >
            {zh
              ? "编号模型内部值，仅用于本方法的诊断，不代表结合、人源化或可开发性；不同序列上下文不能直接混排。"
              : "An internal numbering diagnostic, not binding, humanization or developability; different sequence contexts cannot be freely ranked."}
          </Hint>
          <details>
            <summary>
              {zh
                ? "完整编号与模型诊断"
                : "Full numbering and model diagnostics"}
            </summary>
            <p>
              {zh ? "编号内部值" : "Internal numbering score"}: {domain.score}
            </p>
            <a href={artifactUrl(job.id, "result.json")} download>
              {zh ? "下载完整证据" : "Download full evidence"}
            </a>
          </details>
        </>
      ) : (
        <p role="status">
          {zh
            ? "原生模型未能编号此输入。可检查序列和分子形式，失败原因已保留在完整结果中。"
            : "Native model could not number this input. Check the sequence and format; the reason is retained in the full result."}
          <small title={domain?.reason ?? undefined}>{domain?.reason}</small>
        </p>
      )}
    </div>
  );
}
