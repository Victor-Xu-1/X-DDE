import { expect, it } from "vitest";
import { chainDisplay, hiddenChainIds } from "./chain-visibility";

const atoms = [
  { index: 0, chain: "A", x: 0, y: 1, z: 2 },
  { index: 1, chain: "A", x: 1, y: 1, z: 2 },
  { index: 2, chain: "AB", x: 4, y: 1, z: 2 },
  { index: 3, chain: "", x: 6, y: 1, z: 2 },
];
const chains = ["A", "AB", ""];

it("shows, hides, isolates and restores exact native chain identities without changing atoms", () => {
  const original = structuredClone(atoms);
  const hidden = new Set([0]);
  const next = chainDisplay(
    { action: "hide", chain: "AB" },
    chains,
    atoms,
    hidden,
  );
  expect([...next]).toEqual([0, 2]);
  expect([...hidden]).toEqual([0]);
  expect(hiddenChainIds(atoms, next)).toEqual(["AB"]);
  const only = chainDisplay({ action: "only", chain: "" }, chains, atoms, next);
  expect(hiddenChainIds(atoms, only)).toEqual(["A", "AB"]);
  expect([
    ...chainDisplay({ action: "show", chain: "A" }, chains, atoms, only),
  ]).toEqual([2]);
  expect(chainDisplay({ action: "all" }, chains, atoms, only).size).toBe(0);
  expect(atoms).toEqual(original);
});

it.each([
  null,
  {},
  { action: "only", chain: "B" },
  { action: "delete", chain: "A" },
  { action: "show", chain: 1 },
])("rejects an invalid display request before changing state: %j", (input) => {
  const hidden = new Set([2]);
  expect(() => chainDisplay(input, chains, atoms, hidden)).toThrow();
  expect([...hidden]).toEqual([2]);
});
