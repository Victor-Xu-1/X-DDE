import type { Language } from "../types";
import type {
  ScientificPayload,
  ScientificProgram,
  ScientificTask,
} from "./types";
import { ReinventReview } from "./ReinventReview";
import { PlipReview } from "./PlipReview";
import { ScientificReviewBoltzGen } from "./ScientificReviewBoltzGen";
import { BoundPropertyModelEvidence } from "./PropertyModelEvidence";
import type { BoltzComponent } from "./boltz-inputs";

export function ScientificReview({
  program,
  language,
  payload,
  inputs,
  options,
}: {
  program: ScientificProgram;
  language: Language;
  payload: ScientificPayload;
  inputs: ScientificTask["inputs"];
  options: ScientificTask["options"];
}) {
  if (program === "boltzgen")
    return (
      <ScientificReviewBoltzGen
        language={language}
        payload={payload}
        inputs={inputs}
        options={options}
      />
    );
  if (program === "reinvent")
    return (
      <ReinventReview
        language={language}
        payload={payload}
        options={options}
        ligand={inputs.find((input) => input.role === "ligand")?.source ?? null}
      />
    );
  if (program === "plip")
    return (
      <PlipReview
        inputs={inputs}
        payload={payload}
        options={options}
        language={language}
      />
    );
  const zh = language === "zh";
  return (
    <>
      {program === "chemprop" && payload.mode === "predict" && (
        <BoundPropertyModelEvidence payload={payload} language={language} />
      )}
      <table className="compact-table">
        <tbody>
          <tr>
            <th>{zh ? "计算程序" : "Scientific program"}</th>
            <td>{program === "boltz" ? "Boltz-2" : program}</td>
          </tr>
          <tr>
            <th>{zh ? "材料" : "Inputs"}</th>
            <td>
              {inputs.length
                ? `${inputs.length} ${zh ? "份已确认文件" : "confirmed files"}`
                : zh
                  ? "本次填写的分子与序列"
                  : "Molecules and sequences entered for this task"}
            </td>
          </tr>
          <tr>
            <th>{zh ? "计算设备" : "Device"}</th>
            <td>{options.device === "cuda" ? "GPU" : "CPU"}</td>
          </tr>
          {program === "boltz" &&
            (payload.components as BoltzComponent[])
              .filter((component) => component.kind === "protein")
              .map((component) => (
                <tr key={component.id}>
                  <th>{(zh ? "链 " : "Chain ") + component.id + " MSA"}</th>
                  <td>
                    {component.msa ? (
                      <a
                        href={`/api/assets/${component.msa.asset_id}`}
                        download
                      >
                        {zh
                          ? "本次核验的比对文件"
                          : "Verified alignment for this task"}
                      </a>
                    ) : zh ? (
                      "单序列探索性基线"
                    ) : (
                      "Single-sequence exploratory baseline"
                    )}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </>
  );
}
