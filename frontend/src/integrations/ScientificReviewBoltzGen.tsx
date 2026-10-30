import type { Language } from "../types";
import type { ScientificPayload, ScientificTask } from "./types";

export function ScientificReviewBoltzGen({
  language,
  payload,
  inputs,
  options,
}: {
  language: Language;
  payload: ScientificPayload;
  inputs: ScientificTask["inputs"];
  options: ScientificTask["options"];
}) {
  const zh = language === "zh";
  const scaffolded = ["antibody", "nanobody"].includes(
    String(payload.modality),
  );
  const modalities: Record<string, string> = {
    protein: zh ? "结合蛋白" : "Protein binder",
    peptide: zh ? "肽" : "Peptide",
    antibody: zh ? "抗体可变区" : "Antibody variable region",
    nanobody: zh ? "纳米抗体" : "Nanobody",
  };
  const chains = Array.isArray(payload.target_chains)
    ? payload.target_chains.join(", ")
    : "—";
  return (
    <table
      className="compact-table"
      aria-label={zh ? "结合体设计方案" : "Binder design plan"}
    >
      <tbody>
        <tr>
          <th>{zh ? "计算程序" : "Scientific program"}</th>
          <td>BoltzGen</td>
        </tr>
        <tr>
          <th>{zh ? "设计形式" : "Design modality"}</th>
          <td>{modalities[String(payload.modality)] ?? "—"}</td>
        </tr>
        {inputs.map((input) => (
          <tr key={input.role}>
            <th>
              {input.role === "scaffold"
                ? zh
                  ? "框架结构"
                  : "Framework structure"
                : zh
                  ? "目标结构"
                  : "Target structure"}
            </th>
            <td>
              {input.role === "scaffold"
                ? String(payload.scaffold_chain ?? "—")
                : chains}
              {" · "}
              <a href={`/api/assets/${input.source.asset_id}`} download>
                {zh ? "下载原始结构" : "Download original structure"}
              </a>
            </td>
          </tr>
        ))}
        <tr>
          <th>{zh ? "候选预算" : "Candidate budget"}</th>
          <td>
            {zh
              ? `生成 ${payload.candidates} 个 · 保留 ${payload.retain} 个`
              : `${payload.candidates} generated · ${payload.retain} retained`}
          </td>
        </tr>
        <tr>
          <th>{zh ? "设计范围" : "Design scope"}</th>
          <td>
            {scaffolded
              ? zh
                ? `框架链 ${payload.scaffold_chain} · ${Array.isArray(payload.scaffold_residues) ? payload.scaffold_residues.length : 0} 个设计位点`
                : `Framework chain ${payload.scaffold_chain} · ${Array.isArray(payload.scaffold_residues) ? payload.scaffold_residues.length : 0} design positions`
              : Array.isArray(payload.length)
                ? `${payload.length.join("–")} ${zh ? "个残基" : "residues"}`
                : "—"}
          </td>
        </tr>
        <tr>
          <th>{zh ? "计算资源" : "Compute resources"}</th>
          <td>
            {options.device === "cuda" ? "GPU" : "CPU"}
            {` · ${options.cpu} CPU · ${options.memory_mib} MiB`}
          </td>
        </tr>
        <tr>
          <th>{zh ? "设计采样" : "Design sampling"}</th>
          <td>
            {zh
              ? "此版本不支持用随机种子重现采样；结果保留原生结构和评分。"
              : "This version does not support seed-controlled replay; native structures and scores are retained."}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
