import { useEffect, useState } from "react";
import { referenceKey } from "../research/input-catalog";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { DockingMode, FlexibleReceptor, FlexibleResidue } from "./types";

/** A selection belongs to one exact verified receptor, never a filename or old draft. */
export function useReceptorRefinement(
  mode: DockingMode,
  receptor: MoleculeRef | null,
) {
  const key = mode + ":" + referenceKey(receptor);
  const [stored, setStored] = useState<{
    key: string;
    value: FlexibleResidue[] | null;
  } | null>(null);
  useEffect(() => setStored(null), [key]);
  const value =
    mode === "minimize" && receptor && stored?.key === key
      ? stored.value
      : null;
  const valid = value === null || (value.length >= 1 && value.length <= 8);
  return {
    value,
    valid,
    setValue(next: FlexibleResidue[] | null) {
      setStored({ key, value: next });
    },
    request(language: Language): { flexible_receptor?: FlexibleReceptor } {
      if (!valid)
        throw new Error(
          language === "zh"
            ? "请选择 1–8 个需要调整的侧链。"
            : "Select one to eight sidechains to adjust.",
        );
      return value === null ? {} : { flexible_receptor: { residues: value } };
    },
  };
}
