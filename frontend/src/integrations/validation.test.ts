import { describe, expect, it } from "vitest";
import { nativeDefaults } from "./generated";
import {
  validBoltzComponents,
  validDesignFragments,
  validScientificChoices,
} from "./validation";

describe("scientific form guidance", () => {
  it("requires each fragment and its attachment point before advancing", () => {
    expect(
      validDesignFragments({
        kind: "reinvent",
        mode: "linker",
        fragments: ["c1ccccc1*"],
      }),
    ).toBe(false);
    expect(
      validDesignFragments({
        kind: "reinvent",
        mode: "r_groups",
        fragments: ["c1ccccc1"],
      }),
    ).toBe(false);
    expect(
      validDesignFragments({
        kind: "reinvent",
        mode: "linker",
        fragments: ["c1ccccc1*", "*N1CCNCC1"],
      }),
    ).toBe(true);
  });
  it("blocks reversed optimization windows and invalid expert edits before submission", () => {
    expect(
      validScientificChoices({
        ...nativeDefaults.reinvent,
        molecular_weight: [550, 200],
      }),
    ).toBe(false);
    expect(validScientificChoices({ ...nativeDefaults.openmm, ph: NaN })).toBe(
      false,
    );
    expect(
      validScientificChoices({ ...nativeDefaults.chemprop, epochs: 1 }),
    ).toBe(false);
    expect(
      validScientificChoices({ ...nativeDefaults.reinvent, logp: [-2, 5] }),
    ).toBe(true);
  });
  it("does not retain more designs than it generates", () => {
    expect(
      validScientificChoices({ ...nativeDefaults.boltzgen, retain: 50 }),
    ).toBe(false);
    expect(
      validScientificChoices({ ...nativeDefaults.boltzgen, length: [120, 80] }),
    ).toBe(false);
    expect(
      validScientificChoices({ ...nativeDefaults.boltzgen, length: [80, 80] }),
    ).toBe(true);
  });
  it("requires valid sequence letters and unique chain IDs", () => {
    const protein = {
      id: "A",
      kind: "protein",
      value: "MTEYKLVVVGAGGVGKSALTIQLIQ",
    };
    const ligand = {
      id: "B",
      kind: "ligand",
      value: "CN1CCN(Cc2ccc3ncccc3c2)CC1",
    };
    expect(validBoltzComponents([protein, ligand], true)).toBe(true);
    expect(validBoltzComponents([protein, { ...ligand, id: "A" }], true)).toBe(
      false,
    );
    expect(
      validBoltzComponents([{ ...protein, value: ">sequence\nMTEY" }], false),
    ).toBe(false);
    expect(validBoltzComponents([ligand], true)).toBe(false);
  });
});
