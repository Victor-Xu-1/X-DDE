import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { usePredictionConfidence } from "./usePredictionConfidence";
import {
  confidenceIdentity,
  type ConfidenceBinding,
} from "../viewer/confidence-types";

const binding: ConfidenceBinding = {
  protocol: "boltz-2.2.1-cif-row-v1",
  job: "job",
  candidate: "one",
  url: "/one.cif",
  structure_sha256: "a".repeat(64),
  confidence_sha256: "b".repeat(64),
  atom_plddt: [0.87],
  atom_to_token_idx: [0],
  token_asym_id: [0],
  native_atom_identity: [["A", "ALA", 1, "CA"]],
};
it("only links selections after exact source verification and clears them across sample, source and overlay changes", () => {
  const { result, rerender } = renderHook(
    ({ candidate, enabled }) =>
      usePredictionConfidence("job", candidate, enabled),
    { initialProps: { candidate: "one", enabled: true } },
  );
  act(() => result.current.panel.onBinding(binding));
  expect(result.current.panel.inspection).toBeNull();
  act(() =>
    result.current.viewer.onConfidenceInspection({
      key: confidenceIdentity(binding),
      tokens: [],
      residueScores: {},
    }),
  );
  act(() => result.current.panel.onTokens([0]));
  expect(result.current.viewer.confidenceSelection?.tokens).toEqual([0]);
  const firstNonce = result.current.viewer.confidenceSelection?.nonce;
  act(() => result.current.panel.onTokens([0]));
  expect(result.current.viewer.confidenceSelection?.nonce).toBe(
    firstNonce! + 1,
  );
  act(() =>
    result.current.panel.onBinding({
      ...binding,
      confidence_sha256: "c".repeat(64),
    }),
  );
  expect(result.current.panel.inspection).toBeNull();
  expect(result.current.viewer.confidenceSelection).toBeNull();
  rerender({ candidate: "two", enabled: true });
  expect(result.current.viewer.confidence).toBeNull();
  act(() => result.current.panel.onBinding({ ...binding, candidate: "two" }));
  rerender({ candidate: "two", enabled: false });
  expect(result.current.viewer.confidence).toBeNull();
});
