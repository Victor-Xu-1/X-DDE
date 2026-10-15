import type { Language } from "../types";
import { ReviewReference } from "../diffsbdd/ReviewReference";
import type { DockingResult } from "./types";

export function ReferenceComparison({
  result,
  language,
}: {
  result: DockingResult;
  language: Language;
}) {
  const comparison = result.reference_comparison;
  if (!comparison) return null;
  const zh = language === "zh";
  return (
    <details className="pose-reference-comparison">
      <summary>
        {comparison.role === "input_pose"
          ? zh
            ? "相对初始姿势的变化"
            : "Change from the input pose"
          : zh
            ? "与参考姿势比较"
            : "Compare with the reference pose"}
      </summary>
      <p>
        <ReviewReference
          reference={comparison.reference}
          kind="ligand"
          language={language}
        />
      </p>
      {comparison.status === "ready" ? (
        <p className="field-help">
          {zh
            ? `在同一受体坐标系中比较，不拟合配体。整体偏差包含 ${comparison.heavy_atom_count} 个重原子；接触区在计算前按参考中距受体 ≤ ${comparison.contact_cutoff_angstrom} Å 的 ${comparison.contact_atom_count} 个重原子确定。柔性外露端也计入整体偏差；这些值不表示亲和力或实验验证。`
            : `Compared in the same receptor frame without fitting the ligand. Whole-pose RMSD includes ${comparison.heavy_atom_count} heavy atoms. The contact region is defined before calculation from the ${comparison.contact_atom_count} reference heavy atoms within ${comparison.contact_cutoff_angstrom} Å of the receptor. Flexible exposed tails contribute to whole-pose RMSD. These distances are not affinity or experimental validation.`}
        </p>
      ) : (
        <p className="field-help">
          {comparison.status === "different_chemical_state"
            ? zh
              ? "参考与研究分子的化学结构、状态或立体化学不同，未计算姿势偏差。"
              : "Reference and study molecule differ in chemical identity, state or stereochemistry; pose RMSD was not calculated."
            : zh
              ? "对称映射超过完整比较的上限，未报告不完整的偏差值。"
              : "Symmetry exceeds the complete-comparison limit; no partial RMSD is reported."}
        </p>
      )}
    </details>
  );
}
