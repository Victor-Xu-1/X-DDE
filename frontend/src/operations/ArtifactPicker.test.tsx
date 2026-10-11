import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import type { Job } from "../types";
import { ArtifactPicker } from "./ArtifactPicker";
import { historyFixture } from "../studio/task-history.test-fixtures";
const jobs = Array.from(
  { length: 125 },
  (_, index) =>
    ({
      id: "source-" + index,
      request: {
        operation: "properties",
        name: "Completed source " + index,
        smiles: [],
        ligand_files: [],
      },
      status: "succeeded",
      created_at: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
      started_at: null,
      finished_at: null,
      error: null,
      parent_id: null,
    }) as Job,
);
const asset = {
  id: "result",
  kind: "ligand",
  suffix: ".sdf",
  name: "STAT6.sdf",
  size: 100,
  sha256: "a".repeat(64),
  created_at: "2026-10-11",
};
beforeEach(() => {
  vi.spyOn(api, "taskHistory").mockImplementation(async (path) =>
    historyFixture(jobs, path),
  );
  vi.spyOn(api, "jobs").mockResolvedValue([]);
  vi.spyOn(api, "artifacts").mockResolvedValue([
    { name: asset.name, size: asset.size },
    { name: "audit.sdf", size: 10 },
  ]);
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      ({
        job_id: path.split("/")[2],
        name: asset.name,
        size: asset.size,
        sha256: asset.sha256,
      }) as never,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("finds older completed sources by server paging/search and retains an off-page choice", async () => {
  const user = userEvent.setup();
  render(
    <ArtifactPicker
      kind="ligand"
      accept=".sdf"
      language="en"
      onSelected={vi.fn()}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Source task" });
  await waitFor(() => expect(input).toContainHTML('value="source-0"'));
  for (let page = 0; page < 5; page++) {
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(vi.mocked(api.taskHistory).mock.calls.at(-1)?.[0]).toContain(
        "offset=" + (page + 1) * 20,
      ),
    );
  }
  await user.selectOptions(input, "source-100");
  await user.type(
    screen.getByRole("searchbox", { name: "Find completed tasks" }),
    "no-match",
  );
  await screen.findByText("No matching completed tasks");
  expect(input).toHaveValue("source-100");
  expect(
    screen.getByRole("option", {
      name: "Current selection: Completed source 100",
    }),
  ).toBeInTheDocument();
  expect(api.jobs).not.toHaveBeenCalled();
  expect(screen.queryByRole("option", { name: "audit.sdf" })).toBeNull();
});
it("clears source/file state when switching between research and example results", async () => {
  const user = userEvent.setup();
  render(
    <ArtifactPicker
      kind="ligand"
      accept=".sdf"
      language="en"
      onSelected={vi.fn()}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Source task" });
  await waitFor(() => expect(input).toContainHTML('value="source-0"'));
  await user.selectOptions(input, "source-0");
  await screen.findByRole("combobox", { name: "Result file" });
  await user.click(screen.getByRole("radio", { name: "Example results" }));
  await waitFor(() =>
    expect(vi.mocked(api.taskHistory).mock.calls.at(-1)?.[0]).toContain(
      "scope=examples",
    ),
  );
  expect(input).toHaveValue("");
  expect(screen.queryByRole("combobox", { name: "Result file" })).toBeNull();
});
it("invalidates the previous input immediately and registers only the exact confirmed result", async () => {
  const registered = vi.spyOn(api, "authorized").mockResolvedValue(asset),
    pending = vi.fn(),
    selected = vi.fn(),
    user = userEvent.setup();
  render(
    <ArtifactPicker
      kind="ligand"
      accept=".sdf"
      language="en"
      onSelected={selected}
      onPending={pending}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Source task" });
  await waitFor(() => expect(input).toContainHTML('value="source-0"'));
  await user.selectOptions(input, "source-0");
  const files = await screen.findByRole("combobox", { name: "Result file" });
  await waitFor(() => expect(files).toContainHTML("STAT6.sdf"));
  await user.selectOptions(files, asset.name);
  await user.click(screen.getByRole("button", { name: "Use this result" }));
  await waitFor(() => expect(selected).toHaveBeenCalledExactlyOnceWith(asset));
  expect(pending).toHaveBeenCalledOnce();
  expect(registered.mock.calls[0][0]).toContain(
    "expected_sha256=" + asset.sha256,
  );
});
it("provides a deliberate retry without exposing server internals", async () => {
  vi.mocked(api.artifacts)
    .mockRejectedValueOnce(new Error("/private/runtime failure"))
    .mockResolvedValueOnce([{ name: asset.name, size: asset.size }]);
  const user = userEvent.setup();
  render(
    <ArtifactPicker
      kind="ligand"
      accept=".sdf"
      language="en"
      onSelected={vi.fn()}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Source task" });
  await waitFor(() => expect(input).toContainHTML('value="source-0"'));
  await user.selectOptions(input, "source-0");
  expect(await screen.findByRole("alert")).not.toHaveTextContent("/private");
  await user.click(screen.getByRole("button", { name: "Retry result files" }));
  await screen.findByRole("option", { name: asset.name });
  expect(api.artifacts).toHaveBeenCalledTimes(2);
});
