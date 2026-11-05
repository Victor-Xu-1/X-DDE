import { normalizeProtein } from "../form-model";
import type { Language } from "../types";

/** Labels describe entered materials, never computed structure or confidence. */
export function predictionEntitySummary(
  item: { kind: string; value: string; ligand_file?: string | null },
  language: Language,
) {
  const zh = language === "zh";
  if (item.kind === "ligand") {
    if (item.ligand_file) return zh ? "结构文件" : "Structure file";
    const value = item.value.trim();
    if (!value) return zh ? "未填写分子" : "No molecule";
    return /^CCD_[A-Za-z0-9]{1,8}$/.test(value)
      ? "CCD · " + value.slice(4)
      : "SMILES";
  }
  if (item.kind === "ion")
    return item.value.trim() || (zh ? "未选择离子" : "No ion");
  const sequence = normalizeProtein(item.value);
  if (!sequence) return zh ? "未填写序列" : "No sequence";
  const alphabet =
    item.kind === "protein"
      ? /^[ACDEFGHIKLMNPQRSTVWYX]+$/
      : item.kind === "dna"
        ? /^[ATGCNX]+$/
        : item.kind === "rna"
          ? /^[AUGCNX]+$/
          : null;
  if (!alphabet?.test(sequence)) return zh ? "请检查序列" : "Check sequence";
  return (
    sequence.length +
    (item.kind === "protein"
      ? zh
        ? " 个残基"
        : " residues"
      : zh
        ? " 个碱基"
        : " bases")
  );
}
