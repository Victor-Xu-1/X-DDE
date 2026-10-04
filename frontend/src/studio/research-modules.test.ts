import { expect, it } from "vitest";
import { filterCapabilities } from "../operations/filter";
import { moduleForTool, researchModules } from "./research-modules";
import {
  managementItems,
  navigationActive,
  navigationItems,
  toolForView,
  viewForTool,
  viewTitle,
} from "./navigation-model";
it("covers every existing visible scientific capability exactly once without merging contracts", () => {
  const registered = filterCapabilities("all")
      .map((tool) => tool.id)
      .sort(),
    assigned = researchModules.flatMap((module) => module.tools).sort();
  expect(assigned).toEqual(registered);
  expect(new Set(assigned).size).toBe(44);
  for (const module of researchModules) {
    expect(module.recommended).toContain(module.defaultTool);
    for (const tool of module.recommended) expect(module.tools).toContain(tool);
    for (const tool of module.tools)
      expect(moduleForTool(tool)?.id).toBe(module.id);
  }
});
it("uses nine primary entries, three settings destinations and one active parent for every task", () => {
  expect(navigationItems).toHaveLength(9);
  expect(managementItems).toHaveLength(3);
  for (const tool of filterCapabilities("all")) {
    const view = viewForTool(tool.id);
    expect(toolForView(view)).toBe(tool.id);
    expect(
      navigationItems.filter((item) => navigationActive(view, item)),
    ).toHaveLength(1);
    expect(viewTitle(view, "zh")).toBe(moduleForTool(tool.id)!.label[0]);
  }
  expect(viewForTool("resources")).toBe("deployment");
});
it("promotes complete workflows while preserving complementary methods", () => {
  expect(moduleForTool("admet.predict")?.defaultTool).toBe("admet.predict");
  expect(moduleForTool("properties")?.id).toBe("evaluation");
  expect(moduleForTool("chemistry.states")?.id).toBe("molecules");
  expect(moduleForTool("biopython.ensemble")?.id).toBe("structures");
  expect(moduleForTool("regions")?.id).toBe("binding");
});
