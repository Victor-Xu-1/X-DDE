import { expect, it } from "vitest";
import { complexLigandModel, viewerLoad } from "./source-layout";

it("preserves the original sources when fitting both compared poses", () => {
  const source = {
    urls: ["receptor", "pose-a", "pose-b"],
    comparison: true,
    focusModels: [1, 2],
    records: [0, 0, 0],
  };
  expect(viewerLoad(source)).toEqual(source);
  expect(complexLigandModel(["pdb", "sdf", "sdf"], source)).toBeNull();
});

it.each(
  [[], [1, 1], [3], [-1], [1.5], [true], [0, 1, 2, 3]].map((focusModels) => ({
    focusModels,
  })),
)("rejects invalid or ambiguous comparison focus %j", ({ focusModels }) => {
  expect(() =>
    viewerLoad({
      urls: ["receptor", "pose-a", "pose-b"],
      comparison: true,
      focusModels,
    }),
  ).toThrow();
});

it("rejects competing single- and multiple-model focus declarations", () => {
  expect(() =>
    viewerLoad({
      urls: ["receptor", "pose"],
      comparison: false,
      focusModel: 1,
      focusModels: [1],
    }),
  ).toThrow();
});
