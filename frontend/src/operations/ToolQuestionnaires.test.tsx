import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HarnessForm } from "./HarnessForm";
import { FeatureForm } from "./FeatureForm";
import { ImportForm } from "./ImportForm";
import * as client from "../api";
import { defaults } from "../form-model";
import type { Job } from "../types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function boundary() {
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path === "/harness/readiness"
        ? { configured: true, compute_configured: true, required_settings: [] }
        : path.startsWith("/capabilities/")
          ? { availability: { configuration_present: true } }
          : []) as never,
  );
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
}
it("requires sequences, preserves native ESM normalization and only starts after review", async () => {
  boundary();
  const user = userEvent.setup(),
    submit = vi
      .spyOn(client.api, "submit")
      .mockResolvedValue({ id: "esm-job" } as Job);
  render(<HarnessForm tool="esm" language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: /Sequences to score/ }),
    "ac de",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit compute task" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Submit compute task" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "harness",
    tool: "esm",
    payload: { sequences: ["ACDE"] },
    allow_external: false,
  });
});
it("limits guided MSA inputs to supported sequence kinds and requires service consent", async () => {
  boundary();
  const user = userEvent.setup(),
    submit = vi
      .spyOn(client.api, "submit")
      .mockResolvedValue({ id: "features" } as Job);
  render(<FeatureForm language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.queryByRole("button", { name: /DNA|Ligand|Ion/ }),
  ).not.toBeInTheDocument();
  await user.type(
    screen.getByLabelText("One-letter amino-acid sequence"),
    "ACDE",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: /Allow sequence transmission/ }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Prepare features" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Prepare features" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "msa",
    components: [{ kind: "protein", value: "ACDE", count: 1 }],
    parameters: {
      feature_mode: "search",
      allow_network: true,
      use_template: false,
      use_rna_msa: false,
      search_cpus: 4,
    },
  });
});
it("changing an imported source clears stale predictions and a reviewed batch returns actual jobs", async () => {
  boundary();
  vi.mocked(client.api.assets).mockResolvedValue([
    {
      id: "config1",
      name: "first.json",
      suffix: ".json",
      kind: "config",
      size: 10,
      sha256: "a".repeat(64),
    },
    {
      id: "config2",
      name: "second.json",
      suffix: ".json",
      kind: "config",
      size: 10,
      sha256: "b".repeat(64),
    },
  ] as never);
  const imported = {
    name: "Imported task",
    components: [{ kind: "ligand", value: "CCO", count: 1 }],
    parameters: defaults,
  };
  const post = vi
      .spyOn(client.api, "post")
      .mockImplementation(
        async (path) =>
          (path === "/batches"
            ? [{ id: "batch-actual" }]
            : [imported]) as never,
      ),
    created = vi.fn(),
    user = userEvent.setup();
  render(
    <ImportForm
      language="en"
      jobs={[]}
      onCreated={created}
      onDraft={vi.fn()}
    />,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "How should tasks be prepared?" }),
    "config",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  const input = screen.getByRole("combobox", {
    name: "Existing native OpenDDE JSON",
  });
  await user.click(input);
  await waitFor(() => expect(input).toContainHTML('value="config1"'));
  await user.selectOptions(input, "config1");
  await user.click(screen.getByRole("button", { name: "Import file" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  expect(post).not.toHaveBeenCalledWith(
    "/batches",
    expect.anything(),
    expect.anything(),
  );
  await user.selectOptions(input, "config2");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Import file" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Submit 1 tasks" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: /I reviewed all imported tasks/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit 1 tasks" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Submit 1 tasks" }));
  expect(post).toHaveBeenCalledWith(
    "/batches",
    { tasks: [imported] },
    expect.any(String),
  );
  expect(created).toHaveBeenCalledWith({ id: "batch-actual" });
});
