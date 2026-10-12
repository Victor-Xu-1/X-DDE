import { expect, it } from "vitest";
import { referencePocketResidues } from "./reference-pocket";

it("retains exact negative/author residue numbers in the first receptor model", () => {
  expect(referencePocketResidues(["A:476", "A:611", "B:-2", "A:476"])).toEqual([
    {
      model: 0,
      chain: "A",
      number: 476,
      insertion_code: "",
      alternate_location: "",
    },
    {
      model: 0,
      chain: "A",
      number: 611,
      insertion_code: "",
      alternate_location: "",
    },
    {
      model: 0,
      chain: "B",
      number: -2,
      insertion_code: "",
      alternate_location: "",
    },
  ]);
});

it.each([
  ["A:476", "A:NaN"],
  ["A:1B"],
  ["AA:12"],
  ["A:9007199254740992"],
  null,
])(
  "does not invent a partial display region from malformed native identities: %s",
  (value) => expect(referencePocketResidues(value)).toEqual([]),
);
