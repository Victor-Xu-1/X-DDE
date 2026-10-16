import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { Language } from "../types";
import type { ScientificTask, ScientificPayload } from "./types";

export function PlipReview({
  inputs,
  payload,
  options,
  language,
}: {
  inputs: ScientificTask["inputs"];
  payload: ScientificPayload;
  options: ScientificTask["options"];
  language: Language;
}) {
  const zh = language === "zh";
  if (payload.kind !== "plip") return null;
  const source = inputs.find((row) => row.role === "structure")?.source;
  const ligand =
    typeof payload.ligand_chain === "string" &&
    typeof payload.ligand_number === "number" &&
    Number.isInteger(payload.ligand_number)
      ? `${payload.ligand_chain}:${payload.ligand_number}`
      : zh
        ? "未选择"
        : "Not selected";
  return (
    <>
      <table
        className="compact-table"
        aria-label={
          zh ? "相互作用材料与方案" : "Interaction materials and plan"
        }
      >
        <tbody>
          <tr>
            <th scope="row">{zh ? "方法" : "Method"}</th>
            <td>PLIP</td>
          </tr>
          <tr>
            <th scope="row">{zh ? "复合物" : "Complex"}</th>
            <td>
              {source ? (
                <ReviewReference
                  reference={source}
                  kind="structure"
                  allowedFormats={[".pdb", ".cif"]}
                  language={language}
                />
              ) : zh ? (
                "未选择"
              ) : (
                "Not selected"
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">{zh ? "所选配体" : "Selected ligand"}</th>
            <td>{ligand}</td>
          </tr>
          <tr>
            <th scope="row">{zh ? "计算预算" : "Compute budget"}</th>
            <td>
              CPU · {options.cpu} {zh ? "核" : "cores"} · {options.memory_mib}{" "}
              MiB
            </td>
          </tr>
        </tbody>
      </table>
      <p className="field-help">
        {zh
          ? "按原始坐标分析化学接触；接触距离不是作用力或结合能。"
          : "Classify chemical contacts in the original coordinates; contact distances are not forces or binding energies."}
      </p>
    </>
  );
}
