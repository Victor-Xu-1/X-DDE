import { expect, it } from "vitest";
import {
  toggleAtom,
  validIdentity,
  validateRegions,
  type Region,
} from "./model";
const subject = {
  asset_id: "file",
  sha256: "a".repeat(64),
  record: 1,
  conformer: 0,
  version_id: "version",
};
const identity = {
  mode: "identity",
  complete: true,
  reference: subject,
  molecule_artifact: "selection.sdf",
  identity_basis: "rdkit_removeHs_record_order",
  atoms: [
    { index: 0, element: "C", selectable: true },
    { index: 1, element: "N", selectable: true },
  ],
} as const;
it("validates exact native identity instead of trusting a viewer index or a malformed report", () => {
  expect(validIdentity(identity, subject)).toBe(true);
  expect(validIdentity(identity, { ...subject, record: 0 })).toBe(false);
  for (const malformed of [
    null,
    {},
    { ...identity, complete: false },
    { ...identity, molecule_artifact: "../selection.sdf" },
    { ...identity, atoms: [null] },
    { ...identity, atoms: [{ index: 1, element: "C", selectable: true }] },
  ])
    expect(validIdentity(malformed, subject)).toBe(false);
});
it("changes one logical region while retaining overlapping membership and the full input", () => {
  const regions: Region[] = [
    { name: "A", role: "binder_a", atom_indices: [0, 1] },
    { name: "B", role: "binder_b", atom_indices: [1] },
  ];
  const changed = toggleAtom(regions, 1, 0);
  expect(changed[0]).toEqual(regions[0]);
  expect(changed[1].atom_indices).toEqual([0, 1]);
  expect(regions[1].atom_indices).toEqual([1]);
  expect(validateRegions(changed, [0, 1])).toEqual(changed);
  expect(() =>
    validateRegions([{ ...regions[0], atom_indices: [9] }], [0, 1]),
  ).toThrow(/valid atoms/);
  expect(() =>
    validateRegions(
      [
        { ...regions[0], name: " A " },
        { ...regions[1], name: "A" },
      ],
      [0, 1],
    ),
  ).toThrow(/distinct/);
});
