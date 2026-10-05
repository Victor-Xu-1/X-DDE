import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ResearchStageNavigation } from "./ResearchStageNavigation";
import { ProjectContinuation } from "./ProjectContinuation";
import { researchModules } from "./research-modules";
import type { Project } from "../types";

it.each(["zh", "en"] as const)(
  "opens each real research default without submitting in %s",
  async (language) => {
    const user = userEvent.setup(),
      onSelect = vi.fn();
    render(<ResearchStageNavigation language={language} onSelect={onSelect} />);
    const nav = screen.getByRole("navigation");
    for (const button of within(nav).getAllByRole("button"))
      await user.click(button);
    expect(new Set(onSelect.mock.calls.map((call) => call[0]))).toEqual(
      new Set(researchModules.map((module) => module.defaultTool)),
    );
    expect(nav.querySelector("[aria-current]")).toBeNull();
  },
);

it("keeps research stage entry points reachable by keyboard", async () => {
  const user = userEvent.setup(),
    onSelect = vi.fn();
  render(<ResearchStageNavigation language="zh" onSelect={onSelect} />);
  await user.tab();
  expect(screen.getByRole("button", { name: "进入靶点研究" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("discovery.disease");
});

it("continues the exact saved project and leaves an empty workspace empty", async () => {
  const user = userEvent.setup(),
    onOpen = vi.fn();
  const project: Project = {
    id: "saved-project",
    name: "BRD4 结合模式研究",
    description: "",
    created_at: "2026-10-05T00:00:00Z",
  };
  const { rerender } = render(
    <ProjectContinuation language="zh" projects={[project]} onOpen={onOpen} />,
  );
  expect(screen.getByText(project.name)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "进入研究空间" }));
  expect(onOpen).toHaveBeenLastCalledWith(project);
  rerender(<ProjectContinuation language="zh" projects={[]} onOpen={onOpen} />);
  expect(screen.queryByText(project.name)).toBeNull();
  await user.click(screen.getByRole("button", { name: "进入研究空间" }));
  expect(onOpen).toHaveBeenLastCalledWith(null);
});
