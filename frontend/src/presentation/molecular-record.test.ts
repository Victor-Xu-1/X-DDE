import { expect, it } from "vitest";
import { molecularRecordText } from "./molecular-record";
it("preserves a blank title and exact coordinates while extracting the second SDF record", () => {
  const first =
    "Imatinib\n  source\n\n  1  0  0  0  0  0            999 V2000\n    1.0000    2.0000    3.0000 C   0  0  0  0  0  0\nM  END\n";
  const second =
    "\n  source\n\n  1  0  0  0  0  0            999 V2000\n    8.0000    9.0000   10.0000 N   0  0  0  0  0  0\nM  END\n";
  expect(
    molecularRecordText(first + "$$$$\n" + second + "$$$$\n", 1, "sdf"),
  ).toBe(second);
  expect(molecularRecordText(first, 0, "mol")).toBe(first);
});
it("never substitutes another molecule for an empty, missing or unsupported record", () => {
  for (const [text, n, format] of [
    ["one\n$$$$\n", 1, "sdf"],
    ["\n$$$$\ntwo\n$$$$\n", 0, "sdf"],
    ["mol", 1, "mol"],
    ["mol", -1, "sdf"],
    ["mol", 0.5, "sdf"],
  ] as const)
    expect(() => molecularRecordText(text, n, format)).toThrow();
});
