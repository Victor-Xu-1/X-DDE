import "./antibodies.css";
import "../presentation/result-inspection.css";
import { useState } from "react";
import type { Job, Language, Prediction } from "../types";
import type { AntibodyNumberResult } from "./types";
import { AntibodyDomainDetail } from "./AntibodyDomainDetail";

interface NumberResultProps {
  job: Job;
  result: AntibodyNumberResult;
  language: Language;
  onDraft?(draft: Prediction): void;
}
export function AntibodyNumberResults(props: NumberResultProps) {
  return <AntibodyNumberInspection key={props.job.id} {...props} />;
}
function AntibodyNumberInspection({
  job,
  result,
  language,
  onDraft,
}: NumberResultProps) {
  const zh = language === "zh",
    [index, setIndex] = useState(0);
  const domain = result.domains[index] ?? result.domains[0];
  const selector = (
    <label className="field">
      {zh ? "查看哪个输入/结构域？" : "Which input/domain?"}
      <select
        value={domain ? result.domains.indexOf(domain) : ""}
        onChange={(e) => setIndex(Number(e.target.value))}
        disabled={!result.domains.length}
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
  );
  return (
    <section
      className="discovery-results antibody-number-results"
      aria-label={zh ? "抗体编号结果" : "Antibody numbering results"}
    >
      {domain?.available ? (
        <AntibodyDomainDetail
          key={domain.id}
          selector={selector}
          job={job}
          domain={domain}
          source={result.input_records?.find(
            (record) => record.id === domain.source_id,
          )}
          language={language}
          onDraft={onDraft}
        />
      ) : (
        <>
          {selector}
          <p role="status">
            {domain
              ? zh
                ? "此输入未能完成抗体编号。请检查完整可变域序列和分子形式。"
                : "This input could not be numbered. Check the complete variable-region sequence and format."
              : zh
                ? "本次结果未提供可编号的输入。"
                : "This result contains no numbered inputs."}
          </p>
        </>
      )}
    </section>
  );
}
