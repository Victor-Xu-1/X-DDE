import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:charge-worker"),
);
afterAll(() => worker.mockRestore());
import { GLModel, getColorFromStyle, type AtomSpec } from "3dmol";
import {
  chargeColor,
  electricalSurfaceStyle,
  inputChargesDeclared,
  partialCharge,
  unknownChargeColor,
} from "./charge-surface";
import { surfaceSummary } from "./protocol";

const chargedMol2 =
  "@<TRIPOS>MOLECULE\nCharge regression\n3 2 1 0 0\nSMALL\nGASTEIGER\n\n@<TRIPOS>ATOM\n1 C1 0 0 0 C.2 1 LIG 0.60\n2 O1 1.2 0 0 O.2 1 LIG -0.60\n3 N1 -1.2 0 0 N.3 1 LIG 0.00\n@<TRIPOS>BOND\n1 1 2 2\n2 1 3 1\n";
it("colors actual parsed MOL2 partial charges red/white/blue without modifying coordinates, charges, identity or bond orders", () => {
  const model = new GLModel(0);
  model.addMolData(chargedMol2, "mol2");
  const atoms = model.selectedAtoms({}),
    before = JSON.stringify(atoms);
  expect(inputChargesDeclared(chargedMol2, "mol2")).toBe(true);
  const { style, summary } = electricalSurfaceStyle(atoms, false);
  expect(summary).toEqual({ total: 3, input: 3, estimated: 0, missing: 0 });
  expect(atoms.map((a) => getColorFromStyle({ ...a }, style).getHex())).toEqual(
    [0x0000ff, 0xff0000, 0xffffff],
  );
  expect(JSON.stringify(atoms)).toBe(before);
  expect(atoms[0].bondOrder).toContain(2);
});
it("protein estimates use native named-residue entries and preserve explicit zero or negative input", () => {
  const atoms: (AtomSpec & { partialCharge?: number })[] = [
    { resn: "ASP", atom: "OD1" },
    { resn: "LYS", atom: "NZ" },
    { resn: "ASP", atom: "OD1", partialCharge: 0 },
    { resn: "LYS", atom: "NZ", properties: { partialCharge: -0.6 } },
    { resn: "UNK", atom: "N", elem: "N" },
  ];
  const before = JSON.stringify(atoms),
    { style, summary } = electricalSurfaceStyle(atoms, true);
  expect(summary).toEqual({ total: 5, input: 2, estimated: 2, missing: 1 });
  expect(partialCharge(atoms[0], true)?.value).toBeLessThan(0);
  expect(partialCharge(atoms[1], true)?.value).toBeGreaterThan(0);
  expect(getColorFromStyle(atoms[2], style).getHex()).toBe(0xffffff);
  expect(getColorFromStyle(atoms[3], style).getHex()).toBe(0xff0000);
  expect(getColorFromStyle(atoms[4], style).getHex()).toBe(unknownChargeColor);
  expect(JSON.stringify(atoms)).toBe(before);
});
it.each([NaN, Infinity, -Infinity, null, "0.2"])(
  "invalid supplied charge %s remains unknown rather than silently estimated",
  (invalid) => {
    const atom = {
      resn: "ASP",
      atom: "OD1",
      properties: { partialCharge: invalid },
    } as unknown as AtomSpec;
    expect(partialCharge(atom, true)).toBeNull();
    expect(chargeColor(partialCharge(atom, true))).toBe(unknownChargeColor);
  },
);
it("formal charge, atomic element and NO_CHARGES placeholders cannot create a fake charge surface", () => {
  const noCharges = chargedMol2.replace("GASTEIGER", "NO_CHARGES"),
    model = new GLModel(0);
  model.addMolData(noCharges, "mol2");
  expect(inputChargesDeclared(noCharges, "mol2")).toBe(false);
  expect(
    inputChargesDeclared("@<TRIPOS>MOLECULE\nBad\n3 0\nSMALL", "mol2"),
  ).toBe(false);
  expect(
    electricalSurfaceStyle(model.selectedAtoms({}), false, false).summary
      .missing,
  ).toBe(3);
  const formalChargeOnly = { elem: "N", charge: 1 };
  expect(partialCharge(formalChargeOnly, false)).toBeNull();
  expect(
    electricalSurfaceStyle([{ elem: "C" }, { elem: "O" }], false).summary,
  ).toEqual({ total: 2, input: 0, estimated: 0, missing: 2 });
});
it("uses one fixed charge scale and rejects malformed surface coverage messages", () => {
  expect(chargeColor({ value: -2, source: "input" })).toBe(0xff0000);
  expect(chargeColor({ value: 2, source: "input" })).toBe(0x0000ff);
  expect(
    surfaceSummary({ total: 3, input: 1, estimated: 1, missing: 1 })?.total,
  ).toBe(3);
  for (const detail of [
    null,
    {},
    { total: 3, input: 2, estimated: 2, missing: 0 },
    { total: 0, input: 0, estimated: 0, missing: 0 },
    { total: 1, input: "1", estimated: 0, missing: 0 },
  ])
    expect(surfaceSummary(detail)).toBeNull();
});
