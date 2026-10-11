import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { SimulationForm } from "./SimulationForm";
import { readFepSeries } from "./fep-series";
import { simulationDefaults } from "./generated";
import type { ScientificTask } from "../integrations/types";
vi.mock("./fep-series", async () => ({
  ...(await vi.importActual("./fep-series")),
  readFepSeries: vi.fn(),
}));
vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, request: vi.fn(), api: { ...real.api, submit: vi.fn() } };
});
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: () => <span>Selected protein</span>,
}));
vi.mock("../integrations/LibraryInput", () => ({
  LibraryInput: () => <span>Selected series</span>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Molecular input</span>,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const reference = {
  asset_id: "source",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const protein = { ...reference, asset_id: "protein" };
const task: ScientificTask = {
  operation: "binding_free_energy",
  name: "STAT6 series",
  inputs: [
    { role: "structure", source: protein },
    { role: "library", source: reference },
  ],
  scientific_inputs: [protein, reference],
  payload: {
    ...simulationDefaults.freeEnergy,
    records: [0, 1],
    stage: "calculate",
    repeats: 6,
    temperature_kelvin: 305,
  },
  options: { device: "cpu", cpu: 2, memory_mib: 8192, seed: 101 },
};
it("restored FEP is blocked until its actual records load; retry preserves the exact series and conditions", async () => {
  vi.mocked(request).mockImplementation(async (path) =>
    path.endsWith("metadata")
      ? {
          id: path.includes("/protein/")
            ? protein.asset_id
            : reference.asset_id,
          sha256: reference.sha256,
          name: path.includes("/protein/")
            ? "STAT6-receptor.pdb"
            : "STAT6-series.sdf",
        }
      : { availability: { configuration_present: true } },
  );
  vi.mocked(readFepSeries)
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValueOnce([
      { record: 0, name: "A" },
      { record: 1, name: "B" },
    ]);
  vi.mocked(api.submit).mockRejectedValue(
    new Error("No calculation in this test"),
  );
  const user = userEvent.setup();
  render(
    <SimulationForm
      form="openfe.rbfe"
      language="en"
      initialTask={task}
      onCreated={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be read",
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  expect(screen.getByRole("checkbox", { name: "A · 1" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "B · 2" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", { name: "Independent repeats" }),
  ).toHaveValue("6");
  expect(screen.getByRole("combobox", { name: "Temperature" })).toHaveValue(
    "305",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByText("STAT6-series.sdf")).toBeVisible();
  expect(api.submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Submit simulation" }));
  expect(api.submit).toHaveBeenCalledWith(
    expect.objectContaining({
      inputs: task.inputs,
      payload: expect.objectContaining({
        records: [0, 1],
        repeats: 6,
        temperature_kelvin: 305,
        stage: "calculate",
      }),
    }),
    expect.any(String),
  );
});
it.each([
  [0, 4],
  [0, 0],
])(
  "cannot advance with absent or duplicate restored record IDs %j",
  async (...records) => {
    vi.mocked(request).mockResolvedValue({
      availability: { configuration_present: true },
    });
    vi.mocked(readFepSeries).mockResolvedValue([
      { record: 0, name: "A" },
      { record: 1, name: "B" },
    ]);
    render(
      <SimulationForm
        form="openfe.rbfe"
        language="en"
        initialTask={{ ...task, payload: { ...task.payload, records } }}
        onCreated={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("checkbox", { name: "B · 2" });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(api.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("missing or repeated");
    await userEvent.click(
      screen.getByRole("button", { name: "Keep available selections" }),
    );
    expect(screen.getByRole("checkbox", { name: "A · 1" })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "B · 2" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(api.submit).not.toHaveBeenCalled();
  },
);
