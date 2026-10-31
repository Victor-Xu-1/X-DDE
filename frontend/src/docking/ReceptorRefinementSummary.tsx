import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { DockingResult } from "./types";

export function ReceptorRefinementSummary({
  jobId,
  result,
  language,
}: {
  jobId: string;
  result: DockingResult;
  language: Language;
}) {
  const value = result.receptor_refinement,
    zh = language === "zh";
  if (!value) return null;
  return (
    <details>
      <summary>
        {zh ? "蛋白侧链局部调整" : "Local receptor sidechain adjustment"}
      </summary>
      <p>
        {zh
          ? "预览使用调整后的蛋白与同次优化的配体，主链保持固定。原生程序未报告收敛判定。"
          : "Preview uses the adjusted receptor and its paired ligand; backbone stays fixed. Native convergence was not reported."}
      </p>
      <table className="compact-table">
        <tbody>
          <tr>
            <th scope="row">{zh ? "所选侧链" : "Selected sidechains"}</th>
            <td>
              {value.residues
                .map((r) => `${r.chain}:${r.number}${r.insertion_code}`)
                .join(", ")}
            </td>
          </tr>
          <tr>
            <th scope="row">
              {zh ? "发生位移的侧链原子" : "Moved sidechain atoms"}
            </th>
            <td>{value.moved_sidechain_atoms}</td>
          </tr>
          <tr>
            <th scope="row">
              {zh ? "最大侧链位移" : "Maximum sidechain displacement"}
            </th>
            <td>
              {value.maximum_sidechain_displacement_angstrom.toFixed(3)} Å
            </td>
          </tr>
        </tbody>
      </table>
      <a href={artifactUrl(jobId, result.receptor_artifact)} download>
        {zh ? "下载调整后蛋白" : "Download adjusted receptor"}
      </a>
      {" · "}
      <a href={artifactUrl(jobId, value.input_receptor_artifact)} download>
        {zh ? "下载原始蛋白" : "Download original receptor"}
      </a>
    </details>
  );
}
