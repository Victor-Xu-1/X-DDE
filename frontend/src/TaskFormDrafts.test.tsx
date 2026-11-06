import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TaskForm } from "./TaskForm";
import { api, request } from "./api";
import { emptyOpenDdeEditor } from "./operations/useOpenDdeEditor";
import type { OpenDdeDraft } from "./operations/opendde-draft";

vi.mock("./api", async (original) => {
  const real = await original<typeof import("./api")>();
  return {
    ...real,
    request: vi.fn(),
    api: { ...real.api, authorized: vi.fn() },
  };
});
// Exercise the real form's explicit reset boundary; template metadata/loading has
// its own compiled public-case checks, not a second fake template implementation.
vi.mock("./examples/ExampleActions", () => ({
  ExampleActions: ({ onClear }: { onClear(): void }) => (
    <button type="button" onClick={onClear}>
      New blank task
    </button>
  ),
}));
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
  vi.mocked(request).mockResolvedValue([] as never);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const draft = (): OpenDdeDraft => ({
  id: crypto.randomUUID(),
  tool: "predict",
  schema_version: 1,
  revision: 1,
  archived: false,
  created_at: "2026-11-06T00:00:00Z",
  updated_at: "2026-11-06T00:00:00Z",
  name: "STAT6 continued",
  entities: 2,
  state: {
    ...emptyOpenDdeEditor(),
    name: "STAT6 continued",
    expert: true,
    components: [
      { kind: "protein", count: 1, value: "MSLWGLVSKMPPEK" },
      { kind: "ligand", count: 1, value: "CCD_JQ1" },
    ],
    integer_text: { additional_seeds: "2, unfinished" },
    parameters: { ...emptyOpenDdeEditor().parameters, additional_seeds: [2] },
  },
});
it("saves the current unfinished form through the shared authority without creating a task", async () => {
  const user = userEvent.setup(),
    submit = vi.fn();
  vi.mocked(api.authorized).mockImplementation(async (path, options) => {
    const body = JSON.parse(options!.body as string);
    expect(path).toMatch(/\/prediction-drafts\/[0-9a-f-]+\?tool=predict$/);
    expect(body.tool).toBe("predict");
    return {
      ...draft(),
      id: path.split("/").at(-1)!.split("?")[0],
      ...body,
      revision: 1,
      name: body.state.name,
    } as never;
  });
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "STAT6 unfinished",
  );
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Saved · Not submitted")).toBeVisible();
  expect(api.authorized).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
it("requires explicit resume, preserves unfinished text and blocks native review until corrected", async () => {
  const saved = draft(),
    user = userEvent.setup(),
    submit = vi.fn();
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.includes("/prediction-drafts/")
        ? saved
        : path.startsWith("/prediction-drafts?")
          ? [saved]
          : []) as never,
  );
  render(<TaskForm language="en" ready onSubmit={submit} />);
  expect(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
  ).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "Open drafts" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Drafts" }));
  await user.click(await dialog.findByRole("button", { name: "Resume" }));
  expect(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
  ).toHaveValue("");
  await user.click(dialog.getByRole("button", { name: "Resume this draft" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Drafts" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
  ).toHaveValue("STAT6 continued");
  const next = screen.getByRole("button", { name: "Next" });
  await user.click(next);
  await user.click(next);
  const seeds = screen.getByRole("textbox", {
    name: "Additional seeds (comma separated)",
  });
  expect(seeds).toHaveValue("2, unfinished");
  expect(seeds).toBeInvalid();
  expect(next).toBeDisabled();
  await user.clear(seeds);
  await user.type(seeds, "2, 3");
  expect(next).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();
});

it("starts a separate draft when explicitly clearing an opened draft", async () => {
  const saved = draft(),
    user = userEvent.setup(),
    submit = vi.fn();
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.includes("/prediction-drafts/")
        ? saved
        : path.startsWith("/prediction-drafts?")
          ? [saved]
          : []) as never,
  );
  vi.mocked(api.authorized).mockImplementation(async (path, options) => {
    const body = JSON.parse(options!.body as string);
    const id = path.split("/").at(-1)!.split("?")[0];
    expect(id).not.toBe(saved.id);
    expect(body.revision).toBe(0);
    return {
      ...saved,
      id,
      ...body,
      revision: 1,
      name: body.state.name,
    } as never;
  });
  render(<TaskForm language="en" ready onSubmit={submit} />);
  await user.click(screen.getByRole("button", { name: "Open drafts" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Drafts" }));
  await user.click(await dialog.findByRole("button", { name: "Resume" }));
  await user.click(dialog.getByRole("button", { name: "Resume this draft" }));
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Task name (optional)" }),
    ).toHaveValue(saved.name),
  );
  await user.click(screen.getByRole("button", { name: "New blank task" }));
  expect(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
  ).toHaveValue("");
  expect(
    screen.queryByRole("button", { name: "Save a new copy" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Saved · Not submitted")).toBeVisible();
  expect(api.authorized).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
});
