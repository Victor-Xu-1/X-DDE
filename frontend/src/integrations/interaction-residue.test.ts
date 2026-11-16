import { expect, it } from "vitest";
import {
  interactionResidueKey,
  interactionResidueLabel,
} from "./interaction-residue";
import type { NativeInteraction } from "./types";
import type { Residue } from "../viewer/protocol";

const contact = {
  chain: "A",
  residue: "GLN",
  number: 590,
} as NativeInteraction;
const observed: Residue = {
  chain: "A",
  resn: "GLN",
  resi: 590,
  icode: "",
  key: "A:GLN:590:",
};

it("uses the exact observed residue, including modified names and insertion codes", () => {
  expect(interactionResidueKey(contact, [observed])).toBe(observed.key);
  const inserted = { ...observed, icode: "B", key: "A:GLN:590:B" };
  expect(
    interactionResidueKey({ ...contact, insertion_code: "B" }, [
      observed,
      inserted,
    ]),
  ).toBe(inserted.key);
  expect(interactionResidueLabel({ ...contact, insertion_code: "B" })).toBe(
    "A:GLN590B",
  );
  const modified = { ...observed, resn: "PTR", key: "A:PTR:590:" };
  expect(
    interactionResidueKey({ ...contact, residue: "PTR" }, [modified]),
  ).toBe(modified.key);
});

it("never guesses a missing, wrong-chain, duplicate or insertion-ambiguous source", () => {
  expect(interactionResidueKey(contact, [])).toBeNull();
  expect(
    interactionResidueKey({ ...contact, chain: "B" }, [observed]),
  ).toBeNull();
  expect(interactionResidueKey(contact, [observed, observed])).toBeNull();
  const inserted = { ...observed, icode: "A", key: "A:GLN:590:A" };
  expect(interactionResidueKey(contact, [observed, inserted])).toBeNull();
  expect(
    interactionResidueKey({ ...contact, insertion_code: "" }, [
      observed,
      inserted,
    ]),
  ).toBe(observed.key);
  expect(
    interactionResidueKey({ ...contact, insertion_code: "C" }, [
      observed,
      inserted,
    ]),
  ).toBeNull();
});
