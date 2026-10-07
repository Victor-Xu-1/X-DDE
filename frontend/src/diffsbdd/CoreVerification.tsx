import type { Language } from "../types";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";

import type { CoreVerificationData } from "./types";

const reasons: Record<string, [string, string]> = {
  source_stereo_geometry_inconsistent: [
    "参考双键的立体声明与三维几何不一致，请检查输入",
    "Reference double-bond stereo disagrees with its coordinates; inspect the input",
  ],
  no_core_mapping: [
    "原子身份、内部连接或坐标不满足固定要求",
    "Atom identity, internal bonds or coordinates do not satisfy the fixed core",
  ],
  ambiguous_core_mapping: [
    "存在多个原子映射，无法唯一确认",
    "Multiple atom mappings remain indistinguishable",
  ],
  mapping_budget_exhausted: [
    "原子映射检查达到预算上限",
    "Atom mapping reached its verification budget",
  ],
  stereo_crosses_fixed_boundary: [
    "立体化学依赖区域外原子；请扩大固定区域",
    "Stereo depends on atoms outside the core; expand the fixed selection",
  ],
  unsupported_stereochemistry: [
    "此类立体化学尚不能独立复核",
    "This stereochemistry cannot yet be independently verified",
  ],
  stereo_neighbourhood_changed: [
    "立体中心的连接环境发生变化",
    "The stereocentre neighbourhood changed",
  ],
  stereochemistry_missing: [
    "候选缺失参考立体化学",
    "The candidate lacks reference stereochemistry",
  ],
  stereochemistry_changed: [
    "参考立体化学发生改变",
    "Reference stereochemistry changed",
  ],
  stereo_geometry_inverted: [
    "三维立体方向发生翻转",
    "The local three-dimensional stereo orientation inverted",
  ],
  degenerate_stereo_geometry: [
    "三维几何不足以确认立体方向",
    "Degenerate geometry prevents stereo verification",
  ],
};

export function CoreVerification({
  data,
  jobId,
  language,
}: {
  data: CoreVerificationData;
  jobId: string;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <details className="panel">
      <summary>
        {zh ? "固定区域独立复核" : "Independent fixed-core verification"} ·{" "}
        {data.candidates.length
          ? `${data.qualified_count}/${data.candidates.length}`
          : zh
            ? "没有可复核的候选"
            : "No candidate to verify"}
      </summary>
      <p className="muted">
        {data.preserve_bonds
          ? zh
            ? "核对原子身份、内部键、可确认的立体化学及坐标（原生容差 0.5 Å）。无法确认或违反要求的候选仅供诊断，不能自动复用。"
            : "Checks atom identity, internal bonds, provable stereochemistry and coordinates (native tolerance 0.5 Å). Uncertain or failed candidates remain diagnostic only."
          : zh
            ? "当前仅要求原子身份与坐标保留，未要求保留键或立体化学。此结果不能解释为完整化学核心保留。"
            : "This task requires atom identity and coordinates only, without bond or stereo preservation. It is not proof of a preserved chemical core."}
      </p>
      {data.candidates.length === 0 && (
        <p>
          {zh
            ? "原生程序没有输出可复核的候选。"
            : "The native program returned no candidate to verify."}
        </p>
      )}
      <ul>
        {data.candidates.map((c) => (
          <li key={c.record}>
            <strong>
              {zh ? "候选" : "Candidate"} {c.record + 1} ·{" "}
              {c.status === "passed"
                ? zh
                  ? "通过"
                  : "Passed"
                : c.status === "failed"
                  ? zh
                    ? "违反要求"
                    : "Failed"
                  : zh
                    ? "无法确认"
                    : "Indeterminate"}
            </strong>
            {c.maximum_displacement !== null && (
              <span>
                {" "}
                · {zh ? "最大原子位移" : "Maximum atom displacement"}{" "}
                {c.maximum_displacement.toFixed(4)} Å
              </span>
            )}
            {c.reason && (
              <p>
                {reasons[c.reason]?.[zh ? 0 : 1] ??
                  (zh
                    ? "复核未通过，请查看报告。"
                    : "Verification did not pass; inspect the report.")}
              </p>
            )}
            {c.mapping.length > 0 && (
              <details>
                <summary>
                  {zh ? "查看已验证原子映射" : "View verified atom mapping"}
                </summary>
                <p className="muted">
                  {zh
                    ? "编号从 0 开始，绑定输入和输出各自的 RDKit 重原子顺序；不是预览器编号。"
                    : "Zero-based indices refer to each immutable RDKit heavy-atom record, not viewer indices."}
                </p>
                <p>
                  {c.mapping
                    .map((m) => `${m.source_atom} → ${m.output_atom}`)
                    .join("; ")}
                </p>
              </details>
            )}
            {c.diagnostic_artifact && (
              <details>
                <summary>
                  {zh ? "检查诊断结构" : "Inspect diagnostic structure"}
                </summary>
                <a href={artifactUrl(jobId, c.diagnostic_artifact)} download>
                  {zh ? "下载诊断 SDF" : "Download diagnostic SDF"}
                </a>
                <StructureViewer
                  urls={[artifactUrl(jobId, c.diagnostic_artifact)]}
                  language={language}
                />
              </details>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
