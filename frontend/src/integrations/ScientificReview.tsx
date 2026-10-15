import type { Language } from "../types";
import type {
  ScientificPayload,
  ScientificProgram,
  ScientificTask,
} from "./types";
import { ReinventReview } from "./ReinventReview";

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
  if (program === "reinvent")
    return (
      <ReinventReview
        language={language}
        payload={payload}
        options={options}
        ligand={inputs.find((input) => input.role === "ligand")?.source ?? null}
      />
    );
  const zh = language === "zh";
  return (
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
      </tbody>
    </table>
  );
}
