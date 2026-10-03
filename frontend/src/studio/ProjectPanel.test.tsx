import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectPanel } from "./ProjectPanel";
import { api } from "../api";
const show = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = show;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps creation out of the list and only creates after an explicit valid submission", async () => {
  const save = vi.spyOn(api, "createProject").mockResolvedValue({
      id: "brd4",
      name: "BRD4",
      description: "early leads",
    } as never),
    choose = vi.fn(),
    created = vi.fn(),
    user = userEvent.setup();
  render(
    <ProjectPanel
      language="en"
      projects={[]}
      error=""
      active={null}
      onChoose={choose}
      onCreated={created}
    />,
  );
  expect(
    screen.queryByRole("textbox", { name: "Project name" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /New project/ }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Project name" }),
    "BRD4",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Description (optional)" }),
    "early leads",
  );
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(choose).toHaveBeenCalledWith("brd4"));
  expect(save).toHaveBeenCalledWith("BRD4", "early leads");
  expect(created).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("filters existing projects without mutation and dismisses an unsaved form", async () => {
  const choose = vi.fn(),
    user = userEvent.setup();
  render(
    <ProjectPanel
      language="en"
      projects={
        [
          { id: "brd4", name: "BRD4", description: "pockets" },
          { id: "her2", name: "HER2", description: "antibodies" },
        ] as never
      }
      error=""
      active={null}
      onChoose={choose}
      onCreated={vi.fn()}
    />,
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Search projects" }),
    "HER2",
  );
  expect(
    screen.queryByRole("button", { name: /BRD4/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /HER2/ }));
  expect(choose).toHaveBeenCalledWith("her2");
  await user.click(screen.getByRole("button", { name: /New project/ }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
