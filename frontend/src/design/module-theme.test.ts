import { expect, it } from "vitest";
import { tools } from "../operations/catalog";
import { researchModules, moduleForTool } from "../studio/research-modules";
import { themeForModule, themeForTool, workspaceTheme } from "./module-theme";
import type { MoleculeMinimizeTask } from "../viewer/pose-types";

it("gives every public task one of the generated module backgrounds through the existing navigation", () => {
  for (const tool of tools) {
    const module = moduleForTool(tool.id);
    expect(themeForTool(tool.id)).toBe(
      module ? themeForModule(module.id) : "environments",
    );
    expect([
      "targets",
      "structures",
      "docking",
      "molecules",
      "biologics",
      "properties",
      "environments",
    ]).toContain(themeForTool(tool.id));
  }
  expect(new Set(researchModules.map((m) => themeForModule(m.id))).size).toBe(
    6,
  );
});
it("retains the molecule theme when a preview optimization becomes a persisted task", () => {
  expect(
    workspaceTheme("tasks", null, {
      operation: "molecule_minimize",
    } as MoleculeMinimizeTask),
  ).toBe("molecules");
  expect(workspaceTheme("deployment", null)).toBe("environments");
  expect(workspaceTheme("research", null)).toBe("research");
});
