import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConfidencePanel } from "./ConfidencePanel";
const pending = vi.hoisted(
  () =>
    [] as {
      resolve(value: unknown): void;
      reject(error: unknown): void;
      signal?: AbortSignal;
    }[],
);
vi.mock("../api", () => ({
  request: vi.fn(
    (_url, options) =>
      new Promise((resolve, reject) =>
        pending.push({ resolve, reject, signal: options.signal }),
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

it("shows Boltz token pLDDT with explicit provenance and only supported matrix choices", async () => {
  render(
    <ConfidencePanel
      jobId="boltz"
      candidate="one"
      language="en"
      metrics={["pae", "pde"]}
    />,
  );
  await act(async () =>
    pending.at(-1)!.resolve({
      metric: "pae",
      token_count: 2,
      indices: [0, 1],
      stride: 1,
      matrix: [
        [0, 31.5],
        [2, 0],
      ],
      atom_plddt: [],
      atom_stride: 1,
      atom_plddt_unit: "0-1",
      token_plddt: [
        { index: 0, value: 0 },
        { index: 1, value: 0.87 },
      ],
      native_artifact: "native/pae.npz",
      source_integrity: "current_files",
      token_plddt_unit: "0-1",
      native_sha256: "a".repeat(64),
    }),
  );
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(screen.queryByText("Predicted contact probability")).toBeNull();
  expect(screen.queryByText("Atom confidence")).toBeNull();
  const plot = JSON.parse(
    screen.getByRole("application", { name: "Token pLDDT" }).textContent!,
  )[0];
  expect(plot.y).toEqual([0, 87]);
  expect(
    screen.getByText(/original confidence-file integrity was not recorded/),
  ).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/api/jobs/boltz/confidence?candidate=one&metric=pae&download=true&source_sha256=" +
      "a".repeat(64),
  );
});

it("explains missing native files in Chinese, retries and clears an old binding while reading", async () => {
  const onBinding = vi.fn();
  render(
    <ConfidencePanel
      jobId="boltz"
      candidate="one"
      language="zh"
      metrics={["pae", "pde"]}
      onBinding={onBinding}
    />,
  );
  await act(async () => pending.at(-1)!.reject({ status: 404 }));
  expect(screen.getByRole("status")).toHaveTextContent("没有保留所选视图");
  fireEvent.click(screen.getByRole("button", { name: "重新读取置信度" }));
  expect(screen.getByRole("status")).toHaveTextContent("正在读取");
  await act(async () =>
    pending.at(-1)!.resolve({
      metric: "pae",
      token_count: 1,
      indices: [0],
      stride: 1,
      matrix: [[0]],
      atom_plddt: [],
      atom_stride: 1,
      native_artifact: "pae.npz",
      structure_artifact: "one.cif",
      binding: { protocol: "boltz-2.2.1-cif-row-v1" },
    }),
  );
  expect(onBinding).toHaveBeenLastCalledWith(
    expect.objectContaining({ candidate: "one", job: "boltz" }),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "置信度视图" }), {
    target: { value: "pde" },
  });
  expect(onBinding).toHaveBeenLastCalledWith(null);
  expect(screen.queryByRole("link")).toBeNull();
});

it.each([undefined, "0-100", "unknown"])(
  "does not infer a Boltz token-confidence scale (%s)",
  async (unit) => {
    render(
      <ConfidencePanel
        jobId="boltz"
        candidate="one"
        language="en"
        metrics={["pae", "pde"]}
      />,
    );
    await act(async () =>
      pending
        .at(-1)!
        .resolve({
          metric: "pae",
          token_count: 1,
          indices: [0],
          stride: 1,
          matrix: [[0]],
          atom_plddt: [],
          atom_stride: 1,
          atom_plddt_unit: "0-1",
          token_plddt: [{ index: 0, value: 0.87 }],
          token_plddt_unit: unit,
          native_artifact: "native/pae.npz",
        }),
    );
    expect(
      screen.queryByRole("application", { name: "Token pLDDT" }),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "token-confidence scale could not be verified",
    );
    expect(screen.getByRole("link")).toBeVisible();
  },
);
