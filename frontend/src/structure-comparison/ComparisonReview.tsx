import { useSelectedAsset } from "../operations/useSelectedAsset";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { ComparisonOptions } from "./types";

export function ComparisonReview({
  inputs,
  options,
  language,
}: {
  inputs: Record<"reference" | "moving", MoleculeRef | null>;
  options: ComparisonOptions;
  language: Language;
}) {
  const zh = language === "zh";
  const reference = useSelectedAsset(
    inputs.reference?.asset_id ?? "",
    "structure",
    [".pdb", ".cif"],
    25 * 1024 ** 2,
    null,
  );
  const moving = useSelectedAsset(
    inputs.moving?.asset_id ?? "",
    "structure",
    [".pdb", ".cif"],
    25 * 1024 ** 2,
    null,
  );
  return (
    <dl className="questionnaire-review">
      <dt>{zh ? "参照结构" : "Reference"}</dt>
      <dd>{reference.asset?.name ?? "—"}</dd>
      <dt>{zh ? "比较结构" : "Comparison"}</dt>
      <dd>{moving.asset?.name ?? "—"}</dd>
      <dt>{zh ? "靶蛋白链对应" : "Target mapping"}</dt>
      <dd>
        {options.target_mapping
          .map((p) => `${p.reference} → ${p.moving}`)
          .join("; ")}
      </dd>
      <dt>{zh ? "伙伴链对应" : "Partner mapping"}</dt>
      <dd>
        {options.partner_mapping
          .map((p) => `${p.reference} → ${p.moving}`)
          .join("; ")}
      </dd>
      <dt>{zh ? "模型序号" : "Model indices"}</dt>
      <dd>
        {options.reference_model} → {options.moving_model}
      </dd>
      <dt>{zh ? "分析方法" : "Method"}</dt>
      <dd>Biopython · DockQ 2.1.3</dd>
      <dt>{zh ? "比较目的" : "Purpose"}</dt>
      <dd>
        {options.purpose === "conformational_comparison"
          ? zh
            ? "功能构象比较"
            : "Functional conformational comparison"
          : zh
            ? "模型与参照比较"
            : "Model–reference comparison"}
      </dd>
    </dl>
  );
}
