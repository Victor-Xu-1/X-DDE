import { expect, it } from "vitest";
import { regionAtomIndices } from "./atom-region";
it("maps native serials without treating display order as scientific atom identity", () => {
  const atoms = [
    { serial: 2, index: 10 },
    { serial: 0, index: 8 },
    { serial: 1, index: 9 },
  ];
  expect(regionAtomIndices([0, 2], atoms)).toEqual([8, 10]);
  expect(() => regionAtomIndices([3], atoms)).toThrow("source atom map");
  expect(() => regionAtomIndices([1, 1], atoms)).toThrow("Invalid");
  expect(() => regionAtomIndices([1.5], atoms)).toThrow("Invalid");
});
