import { expect, it, vi } from "vitest";
import {
  foldDisplayHydrogens,
  hasNonDonorHydrogens,
  observeHydrogenDisplay,
} from "./ketcher-hydrogens";
import type { Ketcher } from "./scientificEditor";

it("uses the native fold API for a separate display copy without rewriting a source", async () => {
  const source = "original explicit-H molecular record";
  const toggle = vi.fn(async () => ({ struct: "native display copy" }));
  const editor = {
    structService: { toggleExplicitHydrogens: toggle },
  } as unknown as Ketcher;
  expect(await foldDisplayHydrogens(editor, source)).toBe(
    "native display copy",
  );
  expect(toggle).toHaveBeenCalledWith({
    struct: source,
    mode: "fold",
    output_format: "chemical/x-indigo-ket",
  });
  expect(source).toBe("original explicit-H molecular record");
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

it("coalesces edits made during folding without overwriting a newer molecule", async () => {
  let changed = () => {},
    current = "first molecule";
  let finishFirst: (result: { struct: string }) => void = () => {};
  const carbonH = JSON.stringify({
    mol0: {
      type: "molecule",
      atoms: [{ label: "C" }, { label: "H" }],
      bonds: [{ atoms: [0, 1] }],
    },
  });
  const setMolecule = vi.fn(async (value: string) => {
    current = value;
    changed();
  });
  const toggle = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValue({ struct: "latest folded display" });
  const remove = vi.fn(),
    error = vi.fn(),
    controller = new AbortController();
  const editor = {
    getKet: async () =>
      current === "latest folded display"
        ? "{}"
        : JSON.stringify({ ...JSON.parse(carbonH), metadata: current }),
    getMolfile: async () => current,
    getSmiles: async () => "CN",
    setMolecule,
    structService: { toggleExplicitHydrogens: toggle },
    changeEvent: {
      add: (listener: () => void) => {
        changed = listener;
      },
      remove,
    },
  } as Ketcher;
  observeHydrogenDisplay(editor, controller.signal, error);
  await vi.waitFor(() => expect(toggle).toHaveBeenCalledOnce());
  current = "newer pasted molecule";
  changed();
  finishFirst({ struct: "stale display" });
  await vi.waitFor(() =>
    expect(setMolecule).toHaveBeenCalledWith("latest folded display"),
  );
  expect(setMolecule).not.toHaveBeenCalledWith("stale display");
  expect(error).not.toHaveBeenCalled();
  controller.abort();
  expect(remove).toHaveBeenCalledWith(changed);
});
