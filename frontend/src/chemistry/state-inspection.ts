import type { StateResult, StateSet } from "./types";

export function stateSelection(
  data: StateResult,
  stateIndex: number | undefined,
  record: number | null,
) {
  const state =
    data.states.find((value) => value.index === stateIndex) ?? data.states[0];
  const conformers = data.conformers.filter(
    (value) => value.state_index === state?.index,
  );
  const conformer =
    conformers.find((value) => value.record === record) ?? conformers[0];
  const nativeConformer =
    conformer && /^[a-f0-9]{64}$/.test(conformer.artifact_sha256)
      ? conformer
      : undefined;
  return { state, conformers, conformer, nativeConformer };
}

export function stateReferences(
  data: StateResult,
  sets: StateSet[],
  jobId: string,
  selection: ReturnType<typeof stateSelection>,
) {
  const { state, nativeConformer } = selection;
  const member = sets
    .find((set) => set.source_job === jobId)
    ?.members.find((value) => value.evidence.index === state?.index);
  const stateRef = member?.reference;
  const conformerRef = member?.conformers.find(
    ({ reference, evidence }) =>
      evidence.record === nativeConformer?.record &&
      evidence.artifact === nativeConformer?.artifact &&
      evidence.artifact_sha256 === nativeConformer?.artifact_sha256 &&
      reference.record === nativeConformer?.record &&
      reference.sha256 === data.artifact_sha256[data.conformer_artifact],
  )?.reference;
  return {
    stateRef:
      stateRef?.record === state?.index &&
      stateRef?.sha256 === data.artifact_sha256[data.state_artifact]
        ? stateRef
        : undefined,
    conformerRef,
  };
}
