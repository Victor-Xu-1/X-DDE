import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { request } from "../api";
import { SimulationReview } from "./SimulationReview";
import { SimulationInputs } from "./SimulationInputs";
import { simulationDefaults } from "./generated";
import type { ScientificTask } from "../integrations/types";
import type { SimulationPayload } from "./types";
import userEvent from "@testing-library/user-event";

vi.mock("../api", () => ({ request: vi.fn() }));
const inputs: ScientificTask["inputs"] = [
  {
    role: "structure",
    source: {
      asset_id: "brd4",
      sha256: "a".repeat(64),
      record: 0,
      conformer: 0,
    },
  },
];
const options: ScientificTask["options"] = {
  device: "cpu",
  cpu: 2,
  memory_mib: 8192,
  seed: 101,
};
const file = { id: "brd4", sha256: "a".repeat(64), name: "BRD4-protein.pdb" };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each(["en", "zh"] as const)(
  "%s review shows actual material, backend and chosen conditions without submitting",
  async (language) => {
    vi.mocked(request).mockResolvedValue(file);
    render(
      <SimulationReview
        language={language}
        fep={false}
        program="gromacs"
        inputs={inputs}
        options={options}
        payload={
          {
            ...simulationDefaults.dynamics,
            kind: "gromacs",
            production_ns: 100,
          } as SimulationPayload
        }
        name=""
        setName={vi.fn()}
      />,
    );
    expect(await screen.findByText(file.name)).toBeVisible();
    expect(screen.getByText("GROMACS 2026.3")).toBeVisible();
    expect(
      screen.getByText(
        language === "en" ? "100 ns × 1 repeat" : "100 ns × 1 次重复",
      ),
    ).toBeVisible();
    expect(screen.getByText("0.1 ns · 300 K")).toBeVisible();
    expect(screen.getByText("CPU")).toBeVisible();
    expect(screen.queryByText(/1 files|1 repeats/)).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      "/assets/brd4/metadata",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(
      vi.mocked(request).mock.calls.every(([, init]) => !init?.method),
    ).toBe(true);
  },
);

it("planned FEP exposes mapping and network but never labels future sampling as executed", async () => {
  vi.mocked(request).mockResolvedValue(file);
  render(
    <SimulationReview
      language="en"
      fep
      program="openfe"
      inputs={inputs}
      options={options}
      payload={
        {
          ...simulationDefaults.freeEnergy,
          records: [0, 2, 4],
          atom_mapper: "kartograf",
          network: "minimal",
        } as SimulationPayload
      }
      name=""
      setName={vi.fn()}
    />,
  );
  await screen.findByText(file.name);
  expect(screen.getByText("3 ligands")).toBeVisible();
  expect(screen.getByText("Kartograf")).toBeVisible();
  expect(screen.getByText("Minimal connected network")).toBeVisible();
  expect(screen.getByText("Network planning · No simulation")).toBeVisible();
  expect(
    screen.getByText("Network and atom maps · No free-energy estimates"),
  ).toBeVisible();
  expect(screen.queryByText("Production sampling")).not.toBeInTheDocument();
  expect(screen.queryByText(/MBAR/)).not.toBeInTheDocument();
});

it("calculation review preserves the selected full two-leg sampling and device", async () => {
  vi.mocked(request).mockResolvedValue(file);
  render(
    <SimulationReview
      language="en"
      fep
      program="openfe"
      inputs={inputs}
      options={{ ...options, device: "cuda" }}
      payload={
        {
          ...simulationDefaults.freeEnergy,
          records: [0, 2, 4],
          stage: "calculate",
        } as SimulationPayload
      }
      name=""
      setName={vi.fn()}
    />,
  );
  await screen.findByText(file.name);
  expect(
    screen.getByText("5 ns × 3 repeats × 11 λ × 2 legs / edge"),
  ).toBeVisible();
  expect(screen.getByText("GPU · CUDA")).toBeVisible();
  expect(screen.getByText("ΔΔG ± uncertainty · MBAR")).toBeVisible();
  expect(
    screen.queryByText("Network planning · No simulation"),
  ).not.toBeInTheDocument();
});

it("rejects mismatched material identity and retries the same original selection", async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({ ...file, sha256: "b".repeat(64) })
    .mockResolvedValueOnce(file);
  render(<SimulationInputs language="en" inputs={inputs} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "File details are unavailable",
  );
  expect(screen.queryByText(file.name)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText(file.name)).toBeVisible();
  expect(request).toHaveBeenCalledTimes(2);
});
