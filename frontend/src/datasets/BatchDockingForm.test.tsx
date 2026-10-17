import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BatchDockingForm } from "./BatchDockingForm";
import { request } from "../api";

// Request-hydration protocol only; no scientific result is simulated or submitted.
const fixture = vi.hoisted(() => {
  const receptor = {
    asset_id: "00000000-0000-4000-8000-000000000001",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  const pocket = {
    kind: "box",
    frame: receptor,
    box: { center: [1, 2, 3], size: [20, 20, 20], unit: "angstrom" },
  };
  const source = {
    job_id: "00000000-0000-4000-8000-000000000002",
    report_sha256: "b".repeat(64),
    role: "screening",
  };
  return {
    receptor,
    pocket,
    submit: vi.fn(),
    example: {
      sources: [source],
      task: {
        name: "Protocol GPU template",
        options: { device: "cuda" },
        payload: {
          selected_ids: ["protocol-member"],
          docking: {
            exhaustiveness: 16,
            num_modes: 5,
            time_limit_seconds: 300,
            autobox_add: 6,
          },
        },
      },
    },
  };
});
vi.mock("../api", () => ({ request: vi.fn() }));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, recheck: vi.fn() }),
}));
vi.mock("./useDatasetRun", () => ({
  useDatasetRun: () => ({ busy: false, error: "", submit: fixture.submit }),
}));
vi.mock("./useDatasetExample", () => ({
  useDatasetExample: () => fixture.example,
}));
vi.mock("./SourcePicker", () => ({ SourcePicker: () => null }));
vi.mock("./PocketQuestions", () => ({
  usePocketQuestions: () => ({
    receptor: fixture.receptor,
    pocket: fixture.pocket,
    inputs: [{ role: "structure", source: fixture.receptor }],
  }),
  ReceptorQuestion: () => <p>Protocol receptor input</p>,
  PocketQuestion: () => <p>Protocol pocket input</p>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <img alt={label} />,
}));
afterEach(cleanup);
beforeEach(() => {
  fixture.submit.mockReset().mockResolvedValue(undefined);
  vi.mocked(request)
    .mockReset()
    .mockResolvedValue({
      candidates: [
        {
          id: "protocol-member",
          display_name: "Named candidate",
          artifact: "retained.sdf",
        },
      ],
    } as never);
});

it.each([false, true])(
  "restores the template GPU method and respects an explicit CPU switch: %s",
  async (switchToCPU) => {
    render(<BatchDockingForm language="en" onCreated={vi.fn()} />);
    for (let step = 0; step < 3; step++) {
      const next = screen.getByRole("button", { name: /^Next(?: step)?$/ });
      await waitFor(() => expect(next).toBeEnabled());
      fireEvent.click(next);
    }
    const gpu = screen.getByRole("radio", { name: /GPU/ });
    expect(gpu).toBeChecked();
    if (switchToCPU)
      fireEvent.click(screen.getByRole("radio", { name: /CPU/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Submit batch docking" }),
    );
    await waitFor(() => expect(fixture.submit).toHaveBeenCalledTimes(1));
    const body = fixture.submit.mock.calls[0][0];
    expect(body.payload.selected_ids).toEqual(["protocol-member"]);
    expect(body.payload.docking).toMatchObject({
      use_gpu: !switchToCPU,
      cnn_scoring: switchToCPU ? "none" : "rescore",
      exhaustiveness: 16,
      num_modes: 5,
      time_limit_seconds: 300,
      autobox_add: 6,
    });
    expect(body.options.device).toBe(switchToCPU ? "cpu" : "cuda");
  },
);
