import { expect, it } from "vitest";
import { tools } from "../operations/catalog";
import data from "./guide-data.json";
import { templateGuide } from "./guide";
it("every visible task has bilingual step guidance and result interpretation", () => {
  expect(Object.keys(data).sort()).toEqual(
    [...tools.map((tool) => tool.id), "predict"].sort(),
  );
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
