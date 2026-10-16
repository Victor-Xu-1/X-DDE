import { expect, it } from "vitest";
import { siteChoices } from "./site-labels";
import {
  draftSearch,
  newRegion,
  regionInputsReady,
  regionValue,
} from "./region-draft";
import { poseSourceLabel } from "../poses/source-label";
import type { SiteSet } from "./types";
import type { Combination } from "../poses/types";

const frame = {
  asset_id: "aligned-receptor",
  sha256: "a".repeat(64),
  version_id: "receptor-version",
  record: 0,
  conformer: 0,
};
const ligand = {
  ...frame,
  asset_id: "pocket-reference",
  version_id: "ligand-version",
  record: 2,
};
it("requires a saved exact reference and explicit frame confirmation; preserves selected SDF records", () => {
  const value = {
    ...newRegion(0, 0),
    label: "Known reference region",
    reference: ligand,
  };
  expect(regionInputsReady(value, frame, "en")).toBe(true);
  expect(draftSearch(value, frame, "en")).toBeNull();
  expect(regionValue(value, frame, "en")).toBeNull();
  expect(regionValue({ ...value, confirmed: true }, frame, "en")).toEqual({
    label: value.label,
    member_index: 0,
    search: {
      kind: "reference_ligand",
      frame,
      reference: ligand,
      coordinate_basis: "user_confirmed",
    },
  });
  expect(
    regionValue(
      { ...value, confirmed: true },
      { ...frame, version_id: null },
      "en",
    ),
  ).toBeNull();
  expect(
    regionValue({ ...value, label: "  ", confirmed: true }, frame, "en"),
  ).toBeNull();
});
it("never invents a manual center and retains exact numeric angstrom bounds", () => {
  const value = {
    ...newRegion(0, 1),
    kind: "box" as const,
    label: "Manual region",
  };
  expect(draftSearch(value, frame, "en")).toBeNull();
  expect(
    draftSearch(
      { ...value, center: ["1.25", "-8.1", "20"], size: ["16", "20", "24"] },
      frame,
      "en",
    ),
  ).toEqual({
    kind: "box",
    frame,
    box: { center: [1.25, -8.1, 20], size: [16, 20, 24], unit: "angstrom" },
  });
  expect(
    draftSearch(
      { ...value, center: ["0", "0", "0"], size: ["2", "20", "24"] },
      frame,
      "en",
    ),
  ).toBeNull();
});
it("labels legacy predicted sites and defined conditions without fabricating native ranks", () => {
  const predicted = {
    sites: [
      {
        id: "m00-p3",
        member_index: 0,
        native: { rank: 3 },
        mapping_status: "sufficient",
      },
    ],
  } as SiteSet;
  const defined = {
    schema_version: 2,
    sites: [
      { id: "m01-r1", member_index: 1, label: "Deposited ligand region" },
    ],
  } as SiteSet;
  expect(siteChoices(predicted, "en")[0].label).toBe("Receptor 1 · Pocket 3");
  expect(siteChoices(defined, "en")[0].label).toBe(
    "Receptor 2 · Deposited ligand region",
  );
  expect(poseSourceLabel({ pocket_rank: 3 } as Combination, "en")).toBe(
    "Pocket 3",
  );
  expect(
    poseSourceLabel(
      {
        source_kind: "defined_search",
        source_label: "Deposited ligand region",
      } as Combination,
      "en",
    ),
  ).toBe("Deposited ligand region");
});
