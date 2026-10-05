import { describe, it, expect } from "vitest";
import { nativeInteractions, potentialData } from "./scientific-overlay";
import { viewerLoad } from "./source-layout";

describe("Native scientific overlays", () => {
  it("distinguishes zero classified interactions from absent chemical analysis", () => {
    expect(nativeInteractions(undefined)).toBeUndefined();
    expect(nativeInteractions([])).toEqual([]);
    expect(() =>
      nativeInteractions([{ kind: "hydrogen_bond", distance: NaN }]),
    ).toThrow();
  });
  it("rejects oversized and incomplete potential grids", () => {
    expect(() =>
      potentialData("object 1 class gridpositions counts 999 999 999"),
    ).toThrow();
    expect(() =>
      potentialData("object 1 class gridpositions counts 2 2 2"),
    ).toThrow();
    expect(() =>
      viewerLoad({
        urls: ["/api/jobs/task/download"],
        comparison: false,
        electrostaticMap: { url: "a", unit: "arbitrary" },
      }),
    ).toThrow();
  });
});
