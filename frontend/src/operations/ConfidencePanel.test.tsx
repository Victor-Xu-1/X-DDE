import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConfidencePanel } from "./ConfidencePanel";
const pending = vi.hoisted(
  () => [] as { resolve(value: unknown): void; signal?: AbortSignal }[],
);
vi.mock("../api", () => ({
  request: vi.fn(
    (_url, options) =>
      new Promise((resolve) =>
        pending.push({ resolve, signal: options.signal }),
      ),
  ),
  artifactUrl: (job: string, file: string) => job + "/" + file,
}));
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({ title, data }: { title: string; data: unknown }) => (
    <output role="application" aria-label={title}>
      {JSON.stringify(data)}
    </output>
  ),
}));

it("drops late confidence from the previous sample and never labels token indices as residues", async () => {
  const view = render(
    <ConfidencePanel jobId="job" candidate="first" language="en" />,
  );
  const old = pending[pending.length - 1];
  view.rerender(
    <ConfidencePanel jobId="job" candidate="second" language="en" />,
  );
  const current = pending[pending.length - 1];
  expect(old.signal?.aborted).toBe(true);
  const value = {
    metric: "pae",
    token_count: 2,
    indices: [0, 4],
    stride: 4,
    matrix: [
      [0, 8],
      [9, 0],
    ],
    atom_plddt: [],
    atom_stride: 1,
    native_artifact: "second.npz",
  };
  await act(async () => current.resolve(value));
  expect(
    screen.getByRole("link", { name: "Download full native confidence" }),
  ).toHaveAttribute("href", "job/second.npz");
  await act(async () =>
    old.resolve({ ...value, native_artifact: "first.npz" }),
  );
  expect(screen.getByRole("link")).toHaveAttribute("href", "job/second.npz");
  expect(
    screen.getByText(/Native token indices are not residue numbers/),
  ).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "Confidence view" }), {
    target: { value: "contacts" },
  });
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Loading confidence");
});

it("converts explicitly fractional native atom confidence to the percent axis, including zero", async () => {
  render(<ConfidencePanel jobId="native" candidate="sample" language="en" />);
  await act(async () =>
    pending.at(-1)!.resolve({
      metric: "pae",
      token_count: 1,
      indices: [0],
      stride: 1,
      matrix: [[0]],
      atom_plddt_unit: "0-1",
      atom_plddt: [
        { index: 0, value: 0 },
        { index: 1, value: 0.87 },
        { index: 2, value: 1 },
      ],
      atom_stride: 1,
      native_artifact: "full_data.json",
    }),
  );
  fireEvent.click(screen.getByText("Atom confidence"));
  const trace = JSON.parse(screen.getByLabelText("Atom pLDDT").textContent!)[0];
  expect(trace.x).toEqual([0, 1, 2]);
  expect(trace.y).toEqual([0, 87, 100]);
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "native/full_data.json",
  );
});

it.each([undefined, "0-100", "unknown"])(
  "does not guess atom confidence units (%s) while keeping the valid matrix and raw download",
  async (unit) => {
    render(<ConfidencePanel jobId="native" candidate="sample" language="en" />);
    await act(async () =>
      pending.at(-1)!.resolve({
        metric: "pae",
        token_count: 1,
        indices: [0],
        stride: 1,
        matrix: [[0]],
        atom_plddt_unit: unit,
        atom_plddt: [{ index: 0, value: 0.87 }],
        atom_stride: 1,
        native_artifact: "full_data.json",
      }),
    );
    expect(screen.queryByText("Atom confidence")).toBeNull();
    expect(
      screen.getByText(/The atom-confidence scale could not be verified/),
    ).toBeVisible();
    expect(
      screen.getByRole("application", {
        name: "Predicted aligned error (PAE)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "native/full_data.json",
    );
  },
);
