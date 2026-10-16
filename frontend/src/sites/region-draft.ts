import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { parseBox } from "../docking/model";
import type { DefinedRegion, DefinedSearch } from "./types";

export interface RegionDraft {
  key: number;
  member: number;
  label: string;
  kind: "reference" | "box";
  reference: MoleculeRef | null;
  confirmed: boolean;
  center: string[];
  size: string[];
}
export function newRegion(key: number, member: number): RegionDraft {
  return {
    key,
    member,
    label: "",
    kind: "reference",
    reference: null,
    confirmed: false,
    center: ["", "", ""],
    size: ["20", "20", "20"],
  };
}

/** Keep exact native search contracts; no default center or implicit frame agreement. */
export function draftSearch(
  draft: RegionDraft,
  frame: MoleculeRef | null | undefined,
  language: Language,
): DefinedSearch | null {
  if (!frame?.version_id || frame.record !== 0 || frame.conformer !== 0)
    return null;
  if (draft.kind === "box") {
    try {
      return {
        kind: "box",
        frame,
        box: parseBox(draft.center, draft.size, language),
      };
    } catch {
      return null;
    }
  }
  if (
    !draft.reference?.version_id ||
    draft.reference.conformer !== 0 ||
    !draft.confirmed
  )
    return null;
  return {
    kind: "reference_ligand",
    frame,
    reference: draft.reference,
    coordinate_basis: "user_confirmed",
  };
}

export function regionInputsReady(
  draft: RegionDraft,
  frame: MoleculeRef | null | undefined,
  language: Language,
) {
  return Boolean(
    frame?.version_id &&
    draft.label.trim() &&
    draft.label.trim().length <= 80 &&
    !/[\x00-\x1f\x7f]/.test(draft.label) &&
    (draft.kind === "box"
      ? draftSearch(draft, frame, language)
      : draft.reference?.version_id && draft.reference.conformer === 0),
  );
}

export function regionValue(
  draft: RegionDraft,
  frame: MoleculeRef | null | undefined,
  language: Language,
): DefinedRegion | null {
  const search = draftSearch(draft, frame, language);
  const label = draft.label.trim();
  return search &&
    label.length > 0 &&
    label.length <= 80 &&
    !/[\x00-\x1f\x7f]/.test(label)
    ? { label, member_index: draft.member, search }
    : null;
}
