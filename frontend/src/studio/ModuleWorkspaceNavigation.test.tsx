import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ModuleWorkspaceNavigation } from "./ModuleWorkspaceNavigation";
import { Navigation } from "./Navigation";
import { researchModules } from "./research-modules";
import { viewForResults, viewForTool } from "./navigation-model";

afterEach(cleanup);
it.each(researchModules)("keeps $id results beneath its own module", async (module) => {
  const onView = vi.fn();
  render(<>
    <Navigation view={viewForResults(module.id)} language="en" onView={onView} jobs={[]} />
    <ModuleWorkspaceNavigation view={viewForResults(module.id)} language="en" onView={onView} />
  </>);
  expect(screen.queryByRole("button", { name: "Tasks and results" })).toBeNull();
  const main = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(main).getByRole("button", { name: module.label[1] })).toHaveAttribute("aria-current", "page");
  const workspace = screen.getByRole("navigation", { name: "Module workspace" });
  expect(within(workspace).getByRole("button", { name: "Task results" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(within(workspace).getByRole("button", { name: "New task" }));
  expect(onView).toHaveBeenLastCalledWith(viewForTool(module.defaultTool));
  await userEvent.click(within(workspace).getByRole("button", { name: "Task results" }));
  expect(onView).toHaveBeenLastCalledWith(viewForResults(module.id));
});
it("keeps the Chinese labels concise", () => {
  render(<ModuleWorkspaceNavigation view="gnina.dock" language="zh" onView={() => {}} />);
  expect(screen.getByRole("button", { name: "新建任务" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "任务结果" })).toBeVisible();
});
