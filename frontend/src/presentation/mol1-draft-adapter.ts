import { readMol1Draft, type Mol1DraftState } from "./prediction-draft-model";
import { draftRecord, type DraftAdapter } from "./prediction-draft-contract";

export const mol1DraftAdapter: DraftAdapter<Mol1DraftState, "mol1.predict"> = {
  tool: "mol1.predict",
  model: "Mol-1",
  readState: readMol1Draft,
  readDraft: (value) => draftRecord(value, "mol1.predict", readMol1Draft),
};
