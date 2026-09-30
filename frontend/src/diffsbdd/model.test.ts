import { expect, it } from "vitest";
import {
  compatibleModels,
  designPayload,
  optionsFor,
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
