import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { SimulationForm } from "./SimulationForm";

const ref = {
  asset_id: "protein",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    onChange,
    label,
  }: {
    onChange(value: unknown): void;
    label: string;
  }) => (
    <button type="button" onClick={() => onChange(ref)}>
      {label}
    </button>
  ),
}));
vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, request: vi.fn(), api: { ...real.api, submit: vi.fn() } };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it.each(["openmm.dynamics", "gromacs.dynamics"] as const)(
  "%s requires new input, retains sampling through Back and submits its exact backend",
  async (form) => {
    vi.mocked(request).mockResolvedValue({
      availability: { configuration_present: true },
    });
    vi.mocked(api.submit).mockRejectedValue(
      new Error("Server calculation is not running"),
    );
    const user = userEvent.setup();
    render(<SimulationForm form={form} language="en" onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Protein structure" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("radio", { name: "Extended sampling · 100 ns" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Compute device" }),
      "cpu",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(api.submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("combobox", { name: "Compute device" }),
    ).toHaveValue("cpu");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Submit simulation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server calculation is not running",
    );
    expect(api.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation:
          form === "gromacs.dynamics"
            ? "gromacs_dynamics"
            : "molecular_dynamics",
        scientific_inputs: [ref],
        payload: expect.objectContaining({
          production_ns: 100,
          kind: form === "gromacs.dynamics" ? "gromacs" : "openmm",
          mode: "dynamics",
        }),
        options: expect.objectContaining({ device: "cpu" }),
      }),
      expect.any(String),
    );
  },
);
it("starts FEP with network planning and no historical input or selected molecules", () => {
  vi.mocked(request).mockResolvedValue({
    availability: { configuration_present: false },
  });
  render(
    <SimulationForm form="openfe.rbfe" language="en" onCreated={vi.fn()} />,
  );
  expect(
    screen.getByRole("heading", { name: "1. Choose research inputs" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(api.submit).not.toHaveBeenCalled();
});
