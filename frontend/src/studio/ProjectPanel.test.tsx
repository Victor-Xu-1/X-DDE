import {
  act,
  renderHook,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { useScience } from "./useScience";
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
      loading={false}
      onRetry={vi.fn()}
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
  expect(screen.getByRole("textbox", { name: "Project name" })).toHaveFocus();
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
  expect(created).toHaveBeenCalledExactlyOnceWith({
    id: "brd4",
    name: "BRD4",
    description: "early leads",
  });
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
      loading={false}
      onRetry={vi.fn()}
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

const confirmed = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "New study",
  description: "Confirmed description",
  created_at: "2026-10-13",
};
const existing = {
  ...confirmed,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Existing study",
};
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function SharedProjects({ language = "en" }: { language?: "en" | "zh" }) {
  const science = useScience(null);
  const [active, setActive] = useState<string | null>(null);
  return (
    <ProjectPanel
      language={language}
      projects={science.projects}
      error={science.projectError}
      loading={science.loadingProjects}
      onRetry={() => science.reloadProjects()}
      active={active}
      onChoose={setActive}
      onCreated={science.reloadProjects}
    />
  );
}
function createProject(language: "en" | "zh" = "en") {
  fireEvent.click(
    screen.getByRole("button", {
      name: language === "en" ? /New project/ : /新建项目/,
    }),
  );
  fireEvent.change(
    screen.getByRole("textbox", {
      name: language === "en" ? "Project name" : "项目名称",
    }),
    { target: { value: confirmed.name } },
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: language === "en" ? "Create project" : "创建项目",
    }),
  );
}

it.each(["en", "zh"] as const)(
  "retains the confirmed receipt after read failure and recovers with GET only (%s)",
  async (language) => {
    const retry = pending<(typeof confirmed)[]>();
    const reads = vi
      .spyOn(api, "projects")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("temporary list failure"))
      .mockReturnValueOnce(retry.promise);
    const create = vi.spyOn(api, "createProject").mockResolvedValue(confirmed);
    render(<SharedProjects language={language} />);
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    createProject(language);
    await screen.findByRole("alert");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /New study/ })).toHaveClass(
      "active",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      language === "en" ? "was created" : "已创建",
    );
    expect(
      screen.queryByRole("button", {
        name: /Create your first project|创建第一个项目/,
      }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "en" ? "Retry" : "重试",
      }),
    );
    expect(
      screen.getByRole("button", {
        name: language === "en" ? "Retrying…" : "重试中…",
      }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "temporary list failure",
    );
    expect(screen.getByRole("button", { name: /New study/ })).toHaveClass(
      "active",
    );
    await act(async () => retry.resolve([confirmed]));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("button", { name: /New study/ })).toHaveLength(
      1,
    );
    expect(reads).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledExactlyOnceWith("New study", "");
  },
);

it("preserves existing rows and unacknowledged receipts until a fresh list includes their IDs", async () => {
  vi.spyOn(api, "projects")
    .mockResolvedValueOnce([existing])
    .mockResolvedValueOnce([existing]);
  vi.spyOn(api, "createProject").mockResolvedValue(confirmed);
  render(<SharedProjects />);
  await screen.findByRole("button", { name: /Existing study/ });
  createProject();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("button", { name: /Existing study/ })).toBeVisible();
  expect(screen.getAllByRole("button", { name: /New study/ })).toHaveLength(1);
});

it("ignores older list completions immediately after a receipt and accepts later server metadata", async () => {
  const older = pending<(typeof confirmed)[]>();
  const fresh = pending<(typeof confirmed)[]>();
  vi.spyOn(api, "projects")
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(fresh.promise)
    .mockResolvedValueOnce([{ ...confirmed, name: "Renamed on server" }]);
  const { result } = renderHook(() => useScience(null));
  await act(async () => {
    result.current.reloadProjects(confirmed);
    older.resolve([existing]);
  });
  expect(result.current.projects).toEqual([confirmed]);
  await act(async () => fresh.resolve([confirmed, existing]));
  expect(result.current.projects).toEqual([confirmed, existing]);
  act(() => result.current.reloadProjects());
  await waitFor(() =>
    expect(result.current.projects).toEqual([
      { ...confirmed, name: "Renamed on server" },
    ]),
  );
});

it("shows initial read failure without claiming that no projects exist and retries without POST", async () => {
  const read = pending<(typeof confirmed)[]>();
  const reads = vi
    .spyOn(api, "projects")
    .mockReturnValueOnce(read.promise)
    .mockResolvedValueOnce([existing]);
  const create = vi.spyOn(api, "createProject");
  render(<SharedProjects />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading projects");
  expect(screen.queryByText("No research projects yet")).toBeNull();
  await act(async () => read.reject(new Error("list offline")));
  expect(screen.queryByText("No research projects yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("button", { name: /Existing study/ }),
  ).toBeVisible();
  expect(reads).toHaveBeenCalledTimes(2);
  expect(create).not.toHaveBeenCalled();
});

it("preserves rejected creation input and permits a later explicit retry", async () => {
  vi.spyOn(api, "projects").mockResolvedValue([]);
  const create = vi
    .spyOn(api, "createProject")
    .mockRejectedValueOnce(new Error("create offline"))
    .mockResolvedValueOnce(confirmed);
  render(<SharedProjects />);
  createProject();
  expect(await screen.findByRole("alert")).toHaveTextContent("create offline");
  expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue(
    "New study",
  );
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("button", { name: /New study/ })).toBeVisible();
  expect(create).toHaveBeenCalledTimes(2);
});

it("submits once while creation is pending", async () => {
  vi.spyOn(api, "projects").mockResolvedValue([]);
  const save = pending<typeof confirmed>();
  const create = vi.spyOn(api, "createProject").mockReturnValue(save.promise);
  render(<SharedProjects />);
  createProject();
  fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => save.resolve(confirmed));
  expect(screen.getByRole("button", { name: /New study/ })).toBeVisible();
});

it("deduplicates repeated receipts by ID and ignores a superseded read failure", async () => {
  const older = pending<(typeof confirmed)[]>();
  vi.spyOn(api, "projects")
    .mockReturnValueOnce(older.promise)
    .mockResolvedValue([]);
  const { result } = renderHook(() => useScience(null));
  await act(async () => {
    result.current.reloadProjects(confirmed);
    result.current.reloadProjects(existing);
    result.current.reloadProjects(confirmed);
    older.reject(new Error("superseded read failure"));
  });
  await waitFor(() => expect(result.current.loadingProjects).toBe(false));
  expect(result.current.projectError).toBe("");
  expect(result.current.projects).toHaveLength(2);
  expect(result.current.projects.filter((p) => p.id === confirmed.id)).toEqual([
    confirmed,
  ]);
  expect(result.current.projects.filter((p) => p.id === existing.id)).toEqual([
    existing,
  ]);
});
