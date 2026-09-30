import { expect, it } from "vitest";
import { task, parseBox } from "./model";
import { defaults } from "./generated";
const receptor = {
    asset_id: "r",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  },
  ligand = { ...receptor, asset_id: "l" };
it("binds search coordinates and explicit existing poses to the exact receptor", () => {
  const box = parseBox(["1", "2", "3"], ["20", "20", "20"]);
  expect(
    task("dock", receptor, ligand, defaults, null, box, false, "dock").search,
  ).toEqual({ kind: "box", frame: receptor, box });
  expect(() =>
    task("score", receptor, ligand, defaults, null, null, false, "score"),
  ).toThrow(/Confirm/);
  expect(
    task("score", receptor, ligand, defaults, null, null, true, "score")
      .pose_frame,
  ).toEqual(receptor);
  expect(() =>
    task("dock", receptor, ligand, defaults, null, null, false, "dock"),
  ).toThrow(/search box/);
});
it.each([
  [
    ["", "2", "3"],
    ["20", "20", "20"],
  ],
  [
    ["Infinity", "2", "3"],
    ["20", "20", "20"],
  ],
  [
    ["1", "2", "3"],
    ["0", "20", "20"],
  ],
])(
  "rejects missing, nonfinite and unsupported search dimensions",
  (center, size) => expect(() => parseBox(center, size)).toThrow(),
);
