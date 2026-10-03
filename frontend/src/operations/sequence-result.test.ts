import { expect, it } from "vitest";
import { mutationDescription } from "./sequence-result";
it("converts native tuple and string sequence offsets exactly once without relabeling PDB identities", () => {
  expect(mutationDescription(["A", 29, "S"])).toBe("A:30 → S");
  expect(mutationDescription("B 0 F")).toBe("B:1 → F");
  expect(mutationDescription("B:42A")).toBe("B:42A");
});
