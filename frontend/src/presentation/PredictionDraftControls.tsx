import type { Language } from "../types";
import type { Mol1DraftState, PredictionDraft } from "./prediction-draft-model";
import { mol1DraftAdapter } from "./mol1-draft-adapter";
import { SharedPredictionDraftControls } from "./SharedPredictionDraftControls";

/** Mol-1 keeps its original public form and versioned snapshot contract. */
export function PredictionDraftControls(props: {
  state: Mol1DraftState;
  initial: PredictionDraft | null;
  language: Language;
  busy: boolean;
  onName(value: string): void;
  onResume(value: PredictionDraft): void;
}) {
  return (
    <SharedPredictionDraftControls {...props} adapter={mol1DraftAdapter} />
  );
}
