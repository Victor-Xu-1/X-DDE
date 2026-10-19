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
    <>
      <small className="field-help">
        {zh ? "输出分子的指标" : "Output molecule metrics"}
      </small>
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
    </>
  );
}
