import type { ReactNode } from "react";
import type { Language } from "../types";
import type { GeneratedMetrics } from "./generated-metrics";

export function GeneratedMetricsView({
  active,
  language,
  action,
  fixedRegionVerified,
}: {
  active: GeneratedMetrics;
  language: Language;
  action?: ReactNode;
  fixedRegionVerified?: boolean;
}) {
  const zh = language === "zh";
  return (
    <section
      className="generated-structure-checks"
      aria-label={zh ? "所选构象检查" : "Selected structure checks"}
    >
      <header>
        <strong>{zh ? "所选构象检查" : "Selected structure checks"}</strong>
        {action}
      </header>
      {active.fragments != null && active.fragments > 1 && (
        <p
          className="notice"
          role="status"
          aria-label={zh ? "分子连接状态" : "Molecular connectivity"}
        >
          {zh
            ? `包含 ${active.fragments} 个未连接的结构片段。请先检查连接关系。`
            : `Contains ${active.fragments} disconnected components. Check connectivity before continuing.`}
          {fixedRegionVerified &&
            (zh
              ? "固定区域检查仅覆盖保留核心。"
              : " Fixed-region checks cover the retained core.")}
        </p>
      )}
      <dl className="native-result-metrics generated-primary-metrics">
        <div>
          <dt>QED</dt>
          <dd>{active.qed}</dd>
        </div>
        <div>
          <dt>{zh ? "结构组分" : "Components"}</dt>
          <dd>{active.fragments ?? "—"}</dd>
        </div>
        <div>
          <dt>{zh ? "口袋近接 <1.2 Å" : "Pocket pairs <1.2 Å"}</dt>
          <dd>{active.pocket_atom_pairs_under_1_2_angstrom}</dd>
        </div>
      </dl>
      <p
        className={
          active.relaxation_converged === false ? "notice" : "field-help"
        }
      >
        {zh ? "分子内松弛 · " : "Intramolecular relaxation · "}
        {active.relaxation_converged === true
          ? zh
            ? "已报告收敛"
            : "Reported converged"
          : active.relaxation_converged === false
            ? zh
              ? "未收敛"
              : "Not converged"
            : zh
              ? "未报告收敛信息"
              : "Convergence not reported"}
      </p>
      {active.pocket_atom_pairs_under_1_2_angstrom > 0 && (
        <p className="notice">
          {zh
            ? "存在可能的空间碰撞：请先检查并优化姿势，再进行后续研究。"
            : "Potential steric clashes: inspect and refine the pose before downstream research."}
        </p>
      )}
      <p className="field-help">
        {zh
          ? "近接仅检查条件口袋。完整受体姿势和立体化学需独立质控。"
          : "Proximity covers the conditioning pocket. Verify full-receptor poses and stereochemistry separately."}
      </p>
      <details>
        <summary>{zh ? "更多构象指标" : "More structure metrics"}</summary>
        <dl className="native-result-metrics">
          <div>
            <dt>LogP</dt>
            <dd>{active.logp}</dd>
          </div>
          <div>
            <dt>TPSA · Å²</dt>
            <dd>{active.tpsa}</dd>
          </div>
          <div>
            <dt>HBD / HBA</dt>
            <dd>
              {active.hbd} / {active.hba}
            </dd>
          </div>
          <div>
            <dt>
              {zh ? "最近条件口袋距离" : "Nearest conditioning-pocket distance"}
            </dt>
            <dd>{active.minimum_pocket_distance_angstrom} Å</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
