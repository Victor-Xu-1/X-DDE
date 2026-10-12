import { expect, it } from "vitest";
import type { Job, LigandProperties } from "../types";
import { propertySource } from "./property-source";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const job = {
  request: { operation: "properties", ligand_files: [first, second] },
} as Job;
const molecule = (input: string) =>
  ({ input, available: true }) as LigandProperties;

it("uses the native file and record even when multiple files are concatenated or rows sorted", () => {
  expect(propertySource(job, molecule(second + ":2"))).toEqual({
    url: "/api/assets/" + second,
    record: 1,
  });
  expect(propertySource(job, molecule(first + ":1"))).toEqual({
    url: "/api/assets/" + first,
    record: 0,
  });
});

it.each([
  first + ":0",
  first + ":-1",
  first + ":1.5",
  first + ":90071992547409930",
  first + ":9007199254740992",
  "33333333-3333-4333-8333-333333333333:1",
  "CC(=O)N",
  first + ":2/../3",
])("does not invent a 3D file identity for %s", (input) => {
  expect(propertySource(job, molecule(input))).toBeNull();
});

it("does not interpret another task's input text as an owned molecular file", () => {
  expect(
    propertySource(
      { request: { operation: "msa" } } as Job,
      molecule(first + ":1"),
    ),
  ).toBeNull();
});
