import { expect, it } from "vitest";
import { tools } from "./catalog";
import { filterCapabilities } from "./filter";

const ids = (modality: Parameters<typeof filterCapabilities>[0]) =>
  filterCapabilities(modality).map((tool) => tool.id);

it("uses overlapping actual memberships and includes shared tools for every modality", () => {
  for (const modality of ["biologic", "antibody", "protein"] as const) {
    expect(ids(modality)).toContain("campaign");
  }
  for (const modality of ["chemical", "small_molecule"] as const) {
    expect(ids(modality)).toContain("diffsbdd.generate");
    expect(ids(modality)).toContain("p2rank.detect");
    expect(ids(modality)).not.toContain("campaign");
  }
  for (const modality of ["rna", "dna", "peptide", "small_molecule"] as const) {
    expect(ids(modality)).toEqual(
      expect.arrayContaining(["predict", "import", "resources", "workflows"]),
    );
  }
  expect(ids("rna")).toContain("features");
  expect(ids("dna")).not.toContain("features");
  expect(ids("rna")).not.toContain("diffsbdd.generate");
});

it("keeps one canonical entry per capability even with overlapping memberships", () => {
  const all = filterCapabilities("all");
  expect(all).toHaveLength(tools.length);
  expect(new Set(all.map((tool) => tool.id)).size).toBe(all.length);
});
