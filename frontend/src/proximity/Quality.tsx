import { Hint } from "../guided/Hint";
import {
  partnerRoles,
  type AssemblyProposal,
  type ProximityMechanism,
} from "./types";
import type { Language } from "../types";
export const assemblyClashes = (row: AssemblyProposal) =>
  row.quality.intramolecular_severe_pairs +
  row.quality.ligand_partner_a_severe_pairs +
  row.quality.ligand_partner_b_severe_pairs +
  row.quality.partner_partner_severe_pairs;
export function AssemblyQualityView({
  assembly,
  mechanism,
  language,
}: {
  assembly: AssemblyProposal;
  mechanism: ProximityMechanism;
  language: Language;
}) {
  const zh = language === "zh",
    quality = assembly.quality,
    roles = partnerRoles(mechanism, zh);
  const checks = [
    [
      zh ? "成键几何" : "Covalent geometry",
      quality.bond_violations.length === 0,
    ],
    [zh ? "立体化学" : "Stereochemistry", quality.stereochemistry_preserved],
    [zh ? "空间碰撞" : "Steric clashes", assemblyClashes(assembly) === 0],
    [
      zh ? "两端接触保持" : "Both partner contacts",
      quality.arms.every(
        (a) =>
          a.contacting_heavy_atoms >= 3 &&
          (a.rmsd_from_binary_angstrom === null ||
            a.rmsd_from_binary_angstrom <= 3),
      ),
    ],
  ] as const;
  return (
    <section aria-label={zh ? "结构检查" : "Structural assessment"}>
      <div className="proximity-checks">
        {checks.map(([label, passed]) => (
          <div key={label}>
            <span>{label}</span>
            <strong
              className={
                passed ? "proximity-check-pass" : "proximity-check-fail"
              }
            >
              {passed ? (zh ? "通过" : "Passed") : zh ? "需检查" : "Review"}
            </strong>
          </div>
        ))}
      </div>
      <table className="proximity-contact-table">
        <caption>
          {zh ? "两端的接触与位移" : "Partner contacts and displacement"}
        </caption>
        <thead>
          <tr>
            <th>{zh ? "伙伴" : "Partner"}</th>
            <th>{zh ? "接触原子" : "Contacting atoms"}</th>
            <th>{zh ? "姿势位移（Å）" : "Pose displacement (Å)"}</th>
          </tr>
        </thead>
        <tbody>
          {quality.arms.map((arm, i) => (
            <tr key={i}>
              <th scope="row">{roles[i]}</th>
              <td>{arm.contacting_heavy_atoms}</td>
              <td>{arm.rmsd_from_binary_angstrom?.toFixed(2) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="proximity-caption">
        {zh
          ? "接触范围 4.5 Å；位移相对输入的结合姿势。"
          : "Contacts use a 4.5 Å cutoff; displacement is relative to the input bound pose."}
        <Hint label={zh ? "检查范围" : "Assessment scope"}>
          {zh
            ? "这是完整分子的基本几何检查，不替代独立 PoseBusters 复核、实验验证或自由能计算。"
            : "Basic whole-molecule geometry checks do not replace independent PoseBusters review, experiments or free-energy calculations."}
        </Hint>
      </p>
      <details className="proximity-expert">
        <summary>{zh ? "详细几何指标" : "Detailed geometry"}</summary>
        <dl className="questionnaire-review">
          <dt>{zh ? "分子内部严重碰撞" : "Intramolecular severe pairs"}</dt>
          <dd>{quality.intramolecular_severe_pairs}</dd>
          <dt>{zh ? "分子与蛋白严重碰撞" : "Ligand–protein severe pairs"}</dt>
          <dd>
            {quality.ligand_partner_a_severe_pairs +
              quality.ligand_partner_b_severe_pairs}
          </dd>
          <dt>{zh ? "蛋白之间严重碰撞" : "Protein–protein severe pairs"}</dt>
          <dd>{quality.partner_partner_severe_pairs}</dd>
          <dt>{zh ? "模型排序值（Å）" : "Model ranking surrogate (Å)"}</dt>
          <dd>
            {assembly.ranking_surrogate?.toFixed(2) ?? "—"}
            <Hint label={zh ? "排序值含义" : "Ranking value"}>
              {zh
                ? "模型学习得到的预测误差替代值，不是对参考结构实测的 RMSD，也不是亲和力或活性。"
                : "A learned predicted-error surrogate, not measured reference RMSD, affinity or activity."}
            </Hint>
          </dd>
          <dt>
            {zh
              ? "游离分子松弛差（kcal/mol）"
              : "Unbound relaxation difference (kcal/mol)"}
          </dt>
          <dd>
            {quality.relaxation.difference_kcal_mol?.toFixed(2) ??
              (zh ? "未得到收敛值" : "No converged value")}
            <Hint label={zh ? "松弛差含义" : "Relaxation difference"}>
              {zh
                ? "从当前构象到一次 MMFF94s 局部松弛的势能差；不是绝对应变能、结合能或自由能。"
                : "Potential-energy change in one local MMFF94s relaxation, not absolute strain, binding energy or free energy."}
            </Hint>
          </dd>
        </dl>
      </details>
    </section>
  );
}
