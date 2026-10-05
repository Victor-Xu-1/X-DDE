import { expect, it, vi } from "vitest";
import { configureKetcherPreview } from "./ketcher-appearance";
import type { Ketcher } from "./scientificEditor";
it("uses native Kekulé loading and thin 3D bonds without replacing molecular data", () => {
  const setOptions = vi.fn(),
    setMolecule = vi.fn();
  configureKetcherPreview({
    editor: { setOptions },
    setMolecule,
  } as unknown as Ketcher);
  expect(JSON.parse(setOptions.mock.calls[0][0])).toEqual({
    "dearomatize-on-load": true,
    miewMode: "LN",
    miewAtomLabel: "no",
  });
  expect(setMolecule).not.toHaveBeenCalled();
});
it("does not silently claim success when the native display API is unavailable", () => {
  expect(() => configureKetcherPreview({} as Ketcher)).toThrow(
    "Ketcher display settings are unavailable",
  );
});
