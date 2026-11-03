import { expect, it } from "vitest";
import {
  emptyResidueSelection,
  selectObservedResidues,
} from "./residue-selection";
import type { Residue } from "./protocol";
const rows: Residue[] = [
  { key: "A:GLY:10:", chain: "A", resn: "GLY", resi: 10, icode: "" },
  { key: "A:ASN:10:A", chain: "A", resn: "ASN", resi: 10, icode: "A" },
  { key: "A:LEU:14:", chain: "A", resn: "LEU", resi: 14, icode: "" },
  { key: "AB:LEU:14:", chain: "AB", resn: "LEU", resi: 14, icode: "" },
];
it("ranges follow observed source order, keep insertion codes and never invent missing residues", () => {
  const start = selectObservedResidues(
    { key: rows[0].key, mode: "replace" },
    rows,
    emptyResidueSelection(),
  );
  expect(
    selectObservedResidues({ key: rows[2].key, mode: "range" }, rows, start)
      .keys,
  ).toEqual(rows.slice(0, 3).map((row) => row.key));
  expect(
    selectObservedResidues({ key: rows[3].key, mode: "range" }, rows, start)
      .keys,
  ).toEqual([rows[3].key]);
  const reversed = selectObservedResidues(
    { key: rows[2].key, mode: "replace" },
    rows,
    start,
  );
  expect(
    selectObservedResidues({ key: rows[0].key, mode: "range" }, rows, reversed)
      .keys,
  ).toEqual(rows.slice(0, 3).map((row) => row.key));
});
it("toggles exact residues, removes stale keys and rejects foreign or invalid requests", () => {
  const original = { keys: [rows[0].key, "stale"], anchor: rows[0].key };
  expect(
    selectObservedResidues({ key: rows[0].key, mode: "toggle" }, rows, original)
      .keys,
  ).toEqual([]);
  expect(
    selectObservedResidues({ key: rows[1].key, mode: "toggle" }, rows, original)
      .keys,
  ).toEqual([rows[0].key, rows[1].key]);
  expect(original.keys).toEqual([rows[0].key, "stale"]);
  for (const value of [
    null,
    {},
    { key: rows[0].key, mode: "all" },
    { key: "foreign", mode: "replace" },
  ])
    expect(() => selectObservedResidues(value, rows, original)).toThrow();
});
