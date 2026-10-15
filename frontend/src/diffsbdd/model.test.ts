import { expect, it } from "vitest";
import {
  editableOptions,
  optimizationBudgetValid,
  compatibleModels,
  designPayload,
  optionsFor,
  inpaintSizeValid,
  parseResidues,
} from "./model";
const protein = {
  asset_id: "p",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const molecule = {
  asset_id: "m",
  sha256: "b".repeat(64),
  record: 2,
  conformer: 0,
  version_id: "v",
};
it("exposes all eight models for generation and only conditional models for other modes", () => {
  expect(compatibleModels("generate")).toHaveLength(8);
  expect(compatibleModels("inpaint")).toHaveLength(4);
  expect(compatibleModels("optimize").every((m) => m.strategy === "cond")).toBe(
    true,
  );
});

it("keeps historical envelopes intact while showing only the actual active sizing and sampler controls", () => {
  const historical = {
    ...optionsFor("generate"),
    resamplings: 10,
    jump_length: 7,
  };
  expect(editableOptions("generate", historical)).not.toHaveProperty(
    "resamplings",
  );
  expect(
    editableOptions("generate", { ...historical, model: "moad_ca_joint" }),
  ).toMatchObject({ resamplings: 10, jump_length: 7 });
  const sampled = editableOptions("generate", {
    ...historical,
    size_mode: "sample",
  });
  expect(sampled).not.toHaveProperty("atoms");
  expect(sampled).toMatchObject({ minimum_atoms: 8, size_bias: 0 });
  expect(historical.resamplings).toBe(10);
});

it.each([
  [1, 1, 1, true],
  [100, 1, 3, true],
  [5, 20, 5, true],
  [51, 2, 3, false],
  [10, 21, 3, false],
  [10, 2, 11, false],
  [0, 1, 1, false],
  [10, 2, 0, false],
  [10.5, 2, 3, false],
  [10, 2.5, 3, false],
  [10, 2, 1.5, false],
])(
  "validates real optimization budget %s x %s retaining %s",
  (population, rounds, survivors, allowed) => {
    const options = {
      ...optionsFor("optimize"),
      population,
      rounds,
      survivors,
    };
    expect(optimizationBudgetValid(options)).toBe(allowed);
    const submit = () =>
      designPayload(
        "optimize",
        protein,
        { kind: "ligand", ligand: molecule },
        molecule,
        options,
        [],
      );
    if (allowed)
      expect(submit()).toMatchObject({
        options: { population, rounds, survivors },
      });
    else expect(submit).toThrow(/optimization attempts/);
  },
);

it("checks the native fixed-plus-added size before dispatch while retaining source indices", () => {
  const fixed = Array.from({ length: 71 }, (_, index) => index);
  const options = optionsFor("inpaint");
  const pocket = {
    kind: "residues" as const,
    residues: parseResidues("A:10", protein),
  };
  expect(inpaintSizeValid(options, fixed.length)).toBe(false);
  expect(() =>
    designPayload("inpaint", protein, pocket, molecule, options, fixed),
  ).toThrow(/total 8–80/);
  const allowed = { ...options, added_atoms: 9 };
  expect(inpaintSizeValid(allowed, fixed.length)).toBe(true);
  expect(
    designPayload("inpaint", protein, pocket, molecule, allowed, fixed)
      .fixed_atoms,
  ).toEqual(fixed.map((index) => ({ molecule, index })));
  expect(
    inpaintSizeValid({ ...options, size_mode: "sample" }, fixed.length),
  ).toBe(true);
  expect(inpaintSizeValid({ ...options, added_atoms: 0 }, 80)).toBe(true);
  expect(inpaintSizeValid({ ...options, added_atoms: 6 }, 1)).toBe(false);
  expect(options.added_atoms).toBe(10);
});
it("binds selected residues to exact receptor and rejects ambiguity", () => {
  expect(parseResidues("A:10, A:11", protein).map((r) => r.structure)).toEqual([
    protein,
    protein,
  ]);
  for (const text of ["", "A:10 A:10", "AB:10", "A:10A"])
    expect(() => parseResidues(text, protein)).toThrow();
});
it("preserves the exact molecular record and canonical parser atom identities", () => {
  const pocket = {
    kind: "residues" as const,
    residues: parseResidues("A:10", protein),
  };
  const body = designPayload(
    "inpaint",
    protein,
    pocket,
    molecule,
    optionsFor("inpaint"),
    [1, 3],
  );
  expect(body.fixed_atoms).toEqual([
    { molecule, index: 1 },
    { molecule, index: 3 },
  ]);
  expect(body.options.fragment_policy).toBe("all");
  expect(body.options.relaxation).toBe(0);
  expect(() =>
    designPayload(
      "inpaint",
      protein,
      pocket,
      molecule,
      optionsFor("inpaint"),
      [],
    ),
  ).toThrow();
  expect(() =>
    designPayload(
      "diversify",
      protein,
      pocket,
      null,
      optionsFor("diversify"),
      [],
    ),
  ).toThrow();
  expect(() =>
    designPayload(
      "optimize",
      protein,
      pocket,
      molecule,
      { ...optionsFor("optimize"), model: "moad_ca_joint" },
      [],
    ),
  ).toThrow();
});
