import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FreeEnergyCycle } from "./FreeEnergyCycle";
import { FreeEnergyDiagnostics } from "./FreeEnergyDiagnostics";
import type { FreeEnergyEdge, FreeEnergyLeg } from "./types";

const capture = vi.hoisted(() => vi.fn());
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: (props: {
    title: string;
    onPoint?(point: { pointIndex: number }): void;
  }) => {
    capture(props);
    return (
      <section aria-label={props.title}>
        <button onClick={() => props.onPoint?.({ pointIndex: 1 })}>
          Inspect solvent
        </button>
      </section>
    );
  },
}));

// Controlled display contract, not a measured/public research example.
const leg = (delta: number): FreeEnergyLeg => ({
  delta_g_kcal_mol: delta,
  uncertainty_kcal_mol: 0.2,
  repeat_spread_kcal_mol: null,
  individual: [{ delta_g: delta, mbar_error: 0.2 }],
  overlap: [
    [
      [0.9, 0.1],
      [0.1, 0.9],
    ],
  ],
  convergence: [null],
});
const edge: FreeEnergyEdge = {
  id: "test-edge",
  a: "A",
  b: "B",
  mapping_score: 0.8,
  atom_map: [[0, 0]],
  legs: { complex: leg(-2.3), solvent: leg(-0.5) },
  delta_delta_g_kcal_mol: -1.8,
  uncertainty_kcal_mol: 0.35,
};
afterEach(() => {
  cleanup();
  capture.mockClear();
});

it("retains both signed native legs and reported final error, and links a selected leg", async () => {
  const onLeg = vi.fn();
  render(<FreeEnergyCycle edge={edge} language="en" onLeg={onLeg} />);
  const trace = capture.mock.lastCall![0].data[0];
  expect(trace.x).toEqual([-2.3, -0.5, -1.8]);
  expect(trace.error_x.array).toEqual([0.2, 0.2, 0.35]);
  expect(trace.customdata).toEqual([0.2, 0.2, 0.35]);
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect solvent" }),
  );
  expect(onLeg).toHaveBeenCalledWith("solvent");
  expect(edge.legs!.complex.delta_g_kcal_mol).toBe(-2.3);
});

it("never creates a missing final result or an empirical spread for a single repeat", async () => {
  render(
    <FreeEnergyCycle
      edge={{ ...edge, delta_delta_g_kcal_mol: null }}
      language="en"
      onLeg={() => {}}
    />,
  );
  expect(capture.mock.lastCall![0].data[0].x).toEqual([-2.3, -0.5]);
  cleanup();
  render(<FreeEnergyDiagnostics edge={edge} language="en" />);
  expect(screen.getByText("Not reported")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Inspect solvent" }),
  );
  expect(
    screen.getByRole("combobox", { name: "Thermodynamic leg" }),
  ).toHaveValue("solvent");
  await userEvent.click(screen.getByRole("tab", { name: "Repeats" }));
  const table = screen.getByRole("table", {
    name: "Independent estimates for selected leg",
  });
  expect(table).toHaveTextContent("-0.5");
  expect(table).toHaveTextContent("0.2");
});
