import { expect, it } from "vitest";
import { tools } from "../operations/catalog";
import data from "./guide-data.json";
import { templateGuide } from "./guide";
import type { StudyContext } from "./types";
it("every visible task has bilingual step guidance and result interpretation", () => {
  expect(Object.keys(data).sort()).toEqual(tools.map((tool) => tool.id).sort());
  for (const capability of Object.keys(data))
    for (const language of ["zh", "en"] as const) {
      const guide = templateGuide(capability, language);
      expect(guide.steps).toHaveLength(4);
      expect(guide.steps.every((step) => step.length > 10)).toBe(true);
      expect(guide.interpretation.length).toBeGreaterThan(10);
    }
});
it("unknown modules cannot silently use unrelated case instructions", () =>
  expect(() => templateGuide("unknown", "zh")).toThrow(
    "No reviewed module template guide",
  ));
it("keeps additional study materials separate from the four questionnaire steps", () => {
  const study = {
    required_materials: [["同系列分子", "Congeneric molecules"]],
    guide: {
      steps: [1, 2, 3, 4].map((n) => ["步骤 " + n, "Step " + n]),
      interpretation: ["真实结果", "Native results"],
    },
  } as unknown as StudyContext;
  expect(templateGuide("openfe.rbfe", "en", study).steps).toEqual([
    "Step 1",
    "Step 2",
    "Step 3",
    "Step 4",
  ]);
  expect(study.required_materials[0][1]).toBe("Congeneric molecules");
});
