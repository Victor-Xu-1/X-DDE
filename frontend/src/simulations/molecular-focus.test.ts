import { expect, it } from "vitest";
import { bindingFocusOptions, selectedLigandFocus } from "./molecular-focus";
import type { Loci } from "molstar/lib/mol-model/loci";

const a = { kind: "every-loci" } as Loci;
const b = { kind: "empty-loci" } as Loci;
it("focuses the selected native alternative without replacing its identity", () => {
  expect(selectedLigandFocus([a, b], "a")).toEqual([a]);
  expect(selectedLigandFocus([a, b], "b")).toEqual([b]);
  expect(selectedLigandFocus([a, b], "b")[0]).toBe(b);
  expect(selectedLigandFocus([a, b], "all")).toEqual([a, b]);
});
it("does not silently focus A when requested B is absent", () => {
  expect(selectedLigandFocus([a], "b")).toEqual([]);
  expect(selectedLigandFocus([], "all")).toEqual([]);
});
it("uses native obstruction-aware focus without a transient export camera", () => {
  expect(bindingFocusOptions.optimizeDirection).toBe(true);
  expect(bindingFocusOptions.durationMs).toBe(0);
  expect(bindingFocusOptions.extraRadius).toBeGreaterThan(0);
});
