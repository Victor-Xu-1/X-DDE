import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api";
import * as apiClient from "./api";
import * as deployment from "./deployment/client";
import { defaults } from "./form-model";
import * as i18n from "./i18n";
import type { Health, Job } from "./types";

function job(id: string, name: string, projectId: string | null): Job {
  return {
    id,
    request: {
      name,
      project_id: projectId,
      components: [{ kind: "protein", value: "ACDE", count: 1 }],
      parameters: defaults,
    },
    status: "queued",
    created_at: "2026-09-30T00:00:00Z",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
  };
}
const jobs = [
  job("11111111-1111-4111-8111-111111111111", "Ungrouped task", null),
  job("22222222-2222-4222-8222-222222222222", "Project A task", "project-a"),
  job("33333333-3333-4333-8333-333333333333", "Project B task", "project-b"),
  job("44444444-4444-4444-8444-444444444444", "Another A task", "project-a"),
];
const health: Health = {
  version: "test",
  engine: { ready: true, gpu: null, reason: null },
  worker_ready: true,
  worker_error: null,
  free_disk_gib: 100,
  disk_total_gib: 200,
  capabilities: { prediction: true, msa: false, templates: false, llm: false },
};

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(i18n, "restoreLanguage").mockReturnValue("en");
  vi.spyOn(deployment, "useDeployment").mockReturnValue({
    data: null,
    error: "",
    refresh: vi.fn(),
  });
  vi.spyOn(api, "initialize").mockResolvedValue();
  vi.spyOn(api, "jobs").mockResolvedValue(jobs);
  vi.spyOn(api, "health").mockResolvedValue(health);
  vi.spyOn(api, "logs").mockResolvedValue({ text: "", truncated: false });
  vi.spyOn(api, "artifacts").mockResolvedValue([]);
  vi.spyOn(api, "projects").mockResolvedValue([
    {
      id: "project-a",
      name: "Study A",
      description: "",
      created_at: "2026-09-30",
    },
    {
      id: "project-b",
      name: "Study B",
      description: "",
      created_at: "2026-09-30",
    },
  ]);
});
afterEach(() => vi.restoreAllMocks());

it("opens the shared asset workspace through the integrated navigation", async () => {
  vi.spyOn(apiClient, "request")
    .mockResolvedValueOnce({ nodes: [], edges: [], truncated: false })
    .mockResolvedValueOnce([]);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Research assets" }));
  expect(
    await screen.findByRole("heading", {
      name: "Scientific assets & relationships",
    }),
  ).toBeVisible();
  expect(
    await screen.findByText("Start with your first research asset"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Research assets" }),
  ).toHaveAttribute("aria-current", "page");
  expect(document.title).toBe("Research assets · X-DDE");
});

it("keeps all projects visible when selecting a task from the unfiltered task center", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Task history" }));
  await user.click(
    await screen.findByRole("button", { name: /Project A task/ }),
  );

  expect(screen.getByRole("heading", { name: "Project A task" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "Project filter" })).toBeNull();
  expect(screen.getByRole("button", { name: /Project B task/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Ungrouped task/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Project B task/ }));
  expect(screen.getByRole("heading", { name: "Project B task" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Project A task/ })).toBeVisible();
});

it("applies an explicitly chosen project until the user clears its filter", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Projects" }));
  await user.click(await screen.findByRole("button", { name: /Study A/ }));

  const filter = screen.getByRole("group", { name: "Project filter" });
  expect(filter).toHaveTextContent("Study A");
  expect(screen.queryByRole("button", { name: /Project B task/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: /Another A task/ }));
  expect(screen.getByRole("heading", { name: "Another A task" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Project A task/ })).toBeVisible();

  await user.click(
    within(filter).getByRole("button", { name: "Clear filter" }),
  );
  expect(screen.queryByRole("group", { name: "Project filter" })).toBeNull();
  expect(screen.getByRole("button", { name: /Project B task/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /Ungrouped task/ })).toBeVisible();
});

it("opens core scientific forms directly from the first navigation entries", async () => {
  vi.spyOn(api, "assets").mockResolvedValue([]);
  vi.spyOn(apiClient, "request").mockImplementation(
    async (path) =>
      (path.includes("capabilities")
        ? {
            availability: {
              configuration_present: false,
              missing: ["runtime"],
            },
          }
        : []) as never,
  );
  const user = userEvent.setup(),
    submit = vi.spyOn(api, "submit");
  render(<App />);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  const core = [
    "Structure prediction",
    "Receptor conformations",
    "Pocket discovery",
    "Binding poses",
    "Molecule preparation",
    "Molecule generation",
    "Antibody design",
    "Molecular properties",
    "Molecule editing",
  ];
  expect(
    within(nav)
      .getAllByRole("button")
      .slice(0, core.length)
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(core);
  await user.click(
    within(nav).getByRole("button", { name: "Molecular properties" }),
  );
  expect(screen.getByRole("textbox", { name: "SMILES" })).toBeVisible();
  await user.click(within(nav).getByRole("button", { name: "Binding poses" }));
  expect(
    screen.getByRole("button", { name: "Explore binding poses" }),
  ).toBeDisabled();
  await user.click(
    within(nav).getByRole("button", { name: "Molecule preparation" }),
  );
  expect(
    screen.getByRole("combobox", { name: "What should be prepared?" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Prepare states and conformers" }),
  ).toBeDisabled();
  expect(screen.queryByText("Install research software")).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("keeps a linked non-prediction task in its task view across both history events", async () => {
  const linked = {
    ...jobs[0],
    request: {
      operation: "properties",
      name: "Linked descriptors",
      smiles: ["CCO"],
      ligand_files: [],
    },
  } as Job;
  vi.mocked(api.jobs).mockResolvedValue([linked]);
  render(<App />);
  act(() => {
    window.history.replaceState(null, "", "/#task=" + linked.id);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(
    await screen.findByRole("heading", { name: "Task history" }),
  ).toBeInTheDocument();
  act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  expect(
    await screen.findByRole("heading", { name: "Task history" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Structure prediction" }),
  ).not.toBeInTheDocument();
});
