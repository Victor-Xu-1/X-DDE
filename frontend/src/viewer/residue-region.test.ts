import { expect, it } from "vitest";
import type { AtomSpec } from "3dmol";
import { residueRegion } from "./residue-region";
it("requires the exact model, chain, number, insertion and alternate identity", () => {
  const atoms = [
    { index: 0, chain: "A", resi: 42, icode: "", altLoc: "" },
    { index: 1, chain: "B", resi: 42 },
    { index: 2, chain: "A", resi: 42, icode: "A" },
    { index: 3, chain: "A", resi: 42, altLoc: "B" },
  ] as AtomSpec[];
  const id = {
    model: 0,
    chain: "A",
    number: 42,
    insertion_code: "",
    alternate_location: "",
  };
  expect(residueRegion([id, id], atoms)).toEqual({
    indices: [0],
    requested: 1,
    matched: 1,
  });
  expect(residueRegion([{ ...id, model: 1 }], atoms)).toEqual({
    indices: [],
    requested: 1,
    matched: 0,
  });
  expect(residueRegion([], atoms).indices).toEqual([]);
});
it("rejects unbounded or malformed region messages", () => {
  for (const input of [null, [{ model: 0, number: 42 }], Array(2001).fill({})])
    expect(() => residueRegion(input, [])).toThrow();
});
