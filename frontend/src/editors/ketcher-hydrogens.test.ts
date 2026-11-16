import { expect, it, vi } from "vitest";
import {
  foldDisplayHydrogens,
  hasNonDonorHydrogens,
} from "./ketcher-hydrogens";
import type { Ketcher } from "./scientificEditor";

const explicitKet = JSON.stringify({
  mol0: {
    type: "molecule",
    atoms: [{ label: "C" }, { label: "H" }],
    bonds: [{ atoms: [0, 1] }],
  },
});
const foldedKet = JSON.stringify({
  mol0: { type: "molecule", atoms: [{ label: "C" }], bonds: [] },
});

it("uses the native fold API for a separate display copy without rewriting a source", async () => {
  const source = "original explicit-H molecular record";
  const toggle = vi.fn(async () => ({ struct: foldedKet }));
  const layout = vi.fn(async () => ({ struct: explicitKet }));
  const editor = {
    structService: { toggleExplicitHydrogens: toggle, layout },
  } as unknown as Ketcher;
  expect(await foldDisplayHydrogens(editor, source)).toBe(foldedKet);
  expect(toggle).toHaveBeenCalledWith({
    struct: explicitKet,
    mode: "fold",
    output_format: "chemical/x-indigo-ket",
  });
  expect(layout).toHaveBeenCalledWith({
    struct: source,
    output_format: "chemical/x-indigo-ket",
  });
  expect(source).toBe("original explicit-H molecular record");
});
it("never invokes a native toggle on an already-folded skeleton, preserving donor labels", async () => {
  const toggle = vi.fn(async () => ({ struct: explicitKet }));
  const editor = {
    structService: {
      layout: async () => ({ struct: foldedKet }),
      toggleExplicitHydrogens: toggle,
    },
  } as unknown as Ketcher;
  expect(await foldDisplayHydrogens(editor, "a molecular SMILES")).toBe(
    foldedKet,
  );
  expect(toggle).not.toHaveBeenCalled();
});
it("rejects a noncompliant native result instead of drawing or caching added carbon hydrogens", async () => {
  const editor = {
    structService: {
      layout: async () => ({ struct: explicitKet }),
      toggleExplicitHydrogens: async () => ({ struct: explicitKet }),
    },
  } as unknown as Ketcher;
  await expect(foldDisplayHydrogens(editor, "source")).rejects.toThrow(
    "could not hide non-donor",
  );
});
it("does not mistake polar H or D for carbon-bound hydrogen", () => {
  const molecular = (label: string) =>
    JSON.stringify({
      mol0: {
        type: "molecule",
        atoms: [{ label }, { label: "H" }],
        bonds: [{ atoms: [0, 1] }],
      },
    });
  expect(hasNonDonorHydrogens(molecular("C"))).toBe(true);
  for (const symbol of ["N", "O", "S"])
    expect(hasNonDonorHydrogens(molecular(symbol))).toBe(false);
});
it("fails explicitly if the native API is missing instead of drawing a noncompliant copy", async () => {
  await expect(foldDisplayHydrogens({} as Ketcher, "source")).rejects.toThrow(
    "Update Ketcher",
  );
});
