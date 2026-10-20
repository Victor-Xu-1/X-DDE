import type { Language } from "../types";
import type { GeneratedMetrics } from "./generated-metrics";

export function GeneratedMetricsView({
  active,
  language,
}: {
  active: GeneratedMetrics;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <section aria-label={zh ? "所选构象检查" : "Selected structure checks"}>
      <strong>{zh ? "所选构象检查" : "Selected structure checks"}</strong>
      {active.fragments != null && active.fragments > 1 && (
        <p
          className="notice"
          role="status"
          aria-label={zh ? "分子连接状态" : "Molecular connectivity"}
        >
          {zh
            ? `包含 ${active.fragments} 个未连接的结构片段，尚未形成一个完整分子。固定区域检查通过不代表片段连接成功；请检查连接关系后再用于后续设计。`
            : `Contains ${active.fragments} disconnected components, not one complete molecule. Passing fixed-region checks does not establish successful fragment linking; inspect connectivity before downstream design.`}
        </p>
      )}
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
      <p
        className={
          active.relaxation_converged === false ? "notice" : "field-help"
        }
      >
        {zh ? "分子内松弛：" : "Intramolecular relaxation: "}
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
        {zh
          ? "。不代表完整受体中的几何、立体化学或结合姿势已通过独立质控。"
          : ". This does not establish independently checked full-receptor geometry, stereochemistry or a binding pose."}
      </p>
      <p
        className={
          active.pocket_atom_pairs_under_1_2_angstrom > 0
            ? "notice"
            : "field-help"
        }
      >
        {active.pocket_atom_pairs_under_1_2_angstrom > 0
          ? zh
            ? "存在可能的空间碰撞：请先检查并优化姿势，再进行后续研究。"
            : "Potential steric clashes: inspect and refine the pose before downstream research."
          : zh
            ? "近接指标仅检查作为生成条件的口袋原子，不覆盖其余蛋白；请继续进行完整受体的姿势质控。"
            : "Proximity metrics cover conditioning-pocket atoms only, not the rest of the protein. Continue with full-receptor pose-quality checks."}
      </p>
    </section>
  );
}
