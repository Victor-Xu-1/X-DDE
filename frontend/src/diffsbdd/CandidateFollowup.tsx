import { DiffForm } from "./DiffForm";
import { PropertyForm } from "../operations/PropertyForm";
import { QualityForm } from "../quality/QualityForm";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";

export type CandidateAction =
  "properties" | "quality" | "export" | "inpaint" | "diversify" | "optimize";

/** Exact clicked references are shared by the existing task forms, never resubmitted automatically. */
export function CandidateFollowup({
  action,
  molecule,
  protein,
  language,
  onCreated,
}: {
  action: CandidateAction;
  molecule: MoleculeRef;
  protein: MoleculeRef | null;
  language: Language;
  onCreated(job: Job): void;
}) {
  if (action === "quality")
    return (
      <QualityForm
        language={language}
        initialMolecule={molecule}
        initialProtein={protein}
        onCreated={onCreated}
      />
    );
  if (action === "properties")
    return (
      <PropertyForm
        language={language}
        initialFile={molecule.asset_id}
        scientificInput={molecule}
        onCreated={onCreated}
      />
    );
  return (
    <DiffForm
      language={language}
      mode={action}
      initialMolecule={molecule}
      initialProtein={protein}
      onCreated={onCreated}
    />
  );
}
