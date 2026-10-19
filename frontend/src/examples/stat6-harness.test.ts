import { expect, it } from "vitest";
import { exampleHarnessPayload } from "./harness";
import { templateGuide } from "./guide";
import type { PreparedExample, StudyContext } from "./types";

const study: StudyContext = {
  id: "stat6",
  target: "STAT6",
  organism: "Homo sapiens",
  uniprot: "P42226",
  template_kind: "research_study",
  required_materials: [["STAT6 抗体序列", "STAT6 antibody sequences"]],
  guide: {
    steps: [["使用 STAT6 真实材料", "Use real STAT6 inputs"]],
    interpretation: [
      "计算构象不是结合姿势",
      "Computed conformers are not binding poses",
    ],
  },
};
const example = {
  study,
  sequences: { protein: "STAT6_SEQUENCE" },
  objects: {
    receptor: { reference: { asset_id: "stat6-structure" } },
    receptor_b: { reference: { asset_id: "stat6-alternative" } },
  },
} as unknown as PreparedExample;

it("uses STAT6 protein sequence inputs without carrying over an unrelated antibody", () => {
  expect(
    exampleHarnessPayload("esm", { sequences: ["OLD_ANTIBODY"] }, example)
      .sequences,
  ).toEqual(["STAT6_SEQUENCE"]);
  const fold = exampleHarnessPayload(
    "fold",
    { candidates: [{ candidate_id: "trastuzumab" }] },
    example,
  );
  expect(fold.candidates).toEqual([]);
  expect(fold.options).toEqual({
    target_chains: { B: "STAT6_SEQUENCE" },
    target_chain_ids: ["B"],
    binder_chain_ids: ["A"],
  });
});
it("does not invent legacy comparison roles and clears absent measured population inputs", () => {
  const value = exampleHarnessPayload("rmsd", {}, example);
  expect(value).toEqual({});
  expect(
    exampleHarnessPayload(
      "compare",
      { legacy_path: "old-case", current_path: "old-prediction" },
      example,
    ),
  ).toMatchObject({ legacy_path: "", current_path: "" });
});
it("keeps bilingual study steps separate from required materials without legacy case guidance", () => {
  expect(templateGuide("fold", "en", study).steps).toEqual([
    "Use real STAT6 inputs",
  ]);
  expect(templateGuide("fold", "zh", study).steps).toEqual([
    "使用 STAT6 真实材料",
  ]);
  expect(study.required_materials).toEqual([
    ["STAT6 抗体序列", "STAT6 antibody sequences"],
  ]);
  expect(templateGuide("fold", "zh", study).interpretation).toBe(
    "计算构象不是结合姿势",
  );
});
