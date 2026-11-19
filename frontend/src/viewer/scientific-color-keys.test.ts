import { expect, it } from "vitest";
import { confidenceColor } from "./confidence-types";
import { scientificColorKeys } from "./scientific-color-keys";

const surface = {
  mode: "surface",
  confidence: false,
  hasPotentialMap: true,
  potentialRange: 10,
  language: "en",
} as const;

it("labels the current verified potential range and omits an unconfirmed map", () => {
  expect(scientificColorKeys(surface)).toEqual([
    {
      title: "APBS potential (kBT/e)",
      kind: "scale",
      ticks: ["−10", "0", "+10"],
    },
  ]);
  expect(
    scientificColorKeys({ ...surface, potentialRange: undefined }),
  ).toEqual([]);
  expect(scientificColorKeys({ ...surface, mode: "cartoon" })).toEqual([]);
});

it("describes partial charge estimates and missing coverage without an APBS label", () => {
  const options = { ...surface, hasPotentialMap: false };
  const missing = { color: "#b1b7c1", label: "Gray · no charge data" };
  expect(
    scientificColorKeys({
      ...options,
      surface: { total: 4, input: 1, estimated: 2, missing: 1 },
    })[0],
  ).toMatchObject({
    title: "Approximate partial charge (e)",
    kind: "scale",
    missing,
  });
  expect(
    scientificColorKeys({
      ...options,
      surface: { total: 4, input: 0, estimated: 0, missing: 4 },
    })[0],
  ).toEqual({ title: "Partial charge (e)", kind: "bands", marks: [], missing });
});

it("uses the exact confidence colors at the four measured boundaries", () => {
  expect(
    scientificColorKeys({
      ...surface,
      mode: "cartoon",
      confidence: true,
      language: "zh",
    }),
  ).toEqual([
    {
      title: "pLDDT · 聚合物置信度（0–100）",
      kind: "bands",
      marks: [
        { color: confidenceColor(90.1), label: "> 90" },
        { color: confidenceColor(70), label: "70–90" },
        { color: confidenceColor(50), label: "50–<70" },
        { color: confidenceColor(49.9), label: "< 50" },
      ],
    },
  ]);
});
