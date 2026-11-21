import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Asset } from "../operations/types";
import { UtilityTask } from "./UtilityTask";
import * as client from "../api";

vi.mock("../examples/ExampleActions", () => ({ ExampleActions: () => null }));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../operations/OperationResults", () => ({
  OperationResults: () => <p>Native computed output</p>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Actual input structure</span>,
}));
const asset = {
  id: "stat6",
  name: "STAT6-warhead.sdf",
  kind: "ligand",
  suffix: ".sdf",
  sha256: "a".repeat(64),
  size: 1024,
} as Asset;
const molecule = {
  asset_id: asset.id,
  sha256: asset.sha256,
  record: 0,
  conformer: 0,
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button type="button" onClick={() => onChange(molecule)}>
      Choose molecule
    </button>
  ),
}));
vi.mock("../operations/AssetPicker", () => ({
  AssetPicker: ({
    onChange,
    onSelectedAsset,
  }: {
    onChange(value: string): void;
    onSelectedAsset?(value: Asset): void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onChange(asset.id);
        onSelectedAsset?.(asset);
      }}
    >
      Choose molecular file
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps query validation and explicit Run when the compact selection purpose changes", async () => {
  vi.spyOn(client, "request").mockResolvedValue(asset);
  const send = vi.spyOn(client.api, "submit").mockResolvedValue({
    id: "accepted-library",
    status: "succeeded",
  } as never);
  const user = userEvent.setup();
  render(<UtilityTask tool="screen" language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Choose molecular file" }),
  );
  const purpose = () =>
    screen.getByRole("combobox", { name: "What should this selection do?" });
  await user.selectOptions(purpose(), "similarity");
  expect(purpose()).toHaveValue("similarity");
  const run = screen.getByRole("button", { name: "Run library selection" });
  expect(run).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose molecule" }));
  expect(run).toBeEnabled();
  await user.selectOptions(purpose(), "inventory");
  expect(purpose()).toHaveValue("inventory");
  expect(screen.queryByRole("button", { name: "Choose molecule" })).toBeNull();
  expect(send).not.toHaveBeenCalled();
  await user.click(run);
  expect(send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: "library_screen",
      query: null,
      options: expect.objectContaining({ mode: "inventory" }),
    }),
    expect.any(String),
  );
});

it.each([
  ["admet", "Choose molecule", "Predict properties", "admet_predict"],
  ["brain", "Choose molecule", "Assess brain penetration", "admet_predict"],
  ["properties", "Choose molecular file", "Calculate properties", "properties"],
  [
    "screen",
    "Choose molecular file",
    "Run library selection",
    "library_screen",
  ],
  [
    "states",
    "Choose molecule",
    "Prepare states and conformers",
    "molecular_states",
  ],
] as const)(
  "%s uses its real native form without Next, and shows its accepted result in place",
  async (tool, input, run, operation) => {
    vi.spyOn(client, "request").mockResolvedValue(asset);
    const send = vi.spyOn(client.api, "submit").mockImplementation(
      async (request) =>
        ({
          id: "accepted-" + tool,
          request,
          status: "succeeded",
          error: null,
        }) as never,
    );
    const onCreated = vi.fn(),
      user = userEvent.setup();
    render(<UtilityTask tool={tool} language="en" onCreated={onCreated} />);
    expect(screen.queryByRole("navigation", { name: "Task steps" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: run })).toBeDisabled();
    expect(screen.getByText("More settings (optional)")).toBeVisible();
    await user.click(screen.getByRole("button", { name: input }));
    expect(await screen.findByText("Actual input structure")).toBeVisible();
    expect(send).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: run }));
    expect(await screen.findByText("Native computed output")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus();
    expect(onCreated).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operation }),
      expect.any(String),
    );
    expect(screen.queryByRole("button", { name: input })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit inputs" }));
    expect(screen.getByRole("region", { name: "Task inputs" })).toHaveFocus();
    expect(screen.getByRole("button", { name: input })).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "View current results" }),
    );
    expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus();
    expect(send).toHaveBeenCalledOnce();
    expect(document.querySelector("form form")).toBeNull();
  },
);

it("withdraws the result action when the edited inputs no longer match its task", async () => {
  vi.spyOn(client, "request").mockResolvedValue(asset);
  vi.spyOn(client.api, "submit").mockResolvedValue({
    id: "accepted-properties",
    status: "succeeded",
    request: { operation: "properties" },
  } as never);
  const user = userEvent.setup();
  render(<UtilityTask tool="properties" language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Choose molecular file" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Calculate properties" }),
  );
  await user.click(screen.getByRole("button", { name: "Edit inputs" }));
  expect(
    screen.getByRole("button", { name: "View current results" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("radio", {
      name: "Paste molecular structure text (SMILES)",
    }),
  );
  await user.type(screen.getByRole("textbox", { name: "SMILES" }), "c1ccccc1");
  expect(
    screen.queryByRole("button", { name: "View current results" }),
  ).toBeNull();
  expect(screen.queryByText("Native computed output")).not.toBeInTheDocument();
});
