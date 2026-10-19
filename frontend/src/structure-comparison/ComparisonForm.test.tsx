import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import type { Job } from "../types";
import { api } from "../api";
import { ComparisonForm } from "./ComparisonForm";
import { comparisonDefaults } from "./generated";
import { validMappings } from "./types";

vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../operations/useSelectedAsset", () => ({
  useSelectedAsset: (id: string) => ({ asset: { name: id + ".cif" } }),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Source coordinate preview</div>,
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ label, value }: { label: string; value: unknown }) => (
    <div>
      {label} · {value ? "Selected file" : "Upload a new file"}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("starts from new input selection and keeps unconfigured chain roles invalid", () => {
  render(<ComparisonForm language="en" onCreated={() => {}} />);
  expect(screen.getAllByText(/Upload a new file/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(validMappings([], [])).toBe(false);
  expect(
    validMappings(
      [{ reference: "A", moving: "A" }],
      [{ reference: "A", moving: "C" }],
    ),
  ).toBe(false);
});
it("reviews a loaded study one page at a time and submits its exact roles and immutable inputs", async () => {
  const reference = {
    asset_id: "4Y5U",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  const moving = {
    asset_id: "4Y5W",
    sha256: "b".repeat(64),
    record: 0,
    conformer: 0,
  };
  const options = {
    ...comparisonDefaults,
    correspondence: "author_numbering" as const,
    target_mapping: [{ reference: "A", moving: "A" }],
    partner_mapping: [{ reference: "B", moving: "C" }],
  };
  const preset = {
    request: {
      operation: "structure_compare",
      name: "Unit flow control",
      reference,
      moving,
      options,
    },
    objects: {},
    module: { capability_id: "rmsd" },
  } as unknown as PreparedExample;
  const created = vi.fn(),
    submit = vi
      .spyOn(api, "submit")
      .mockResolvedValue({ id: "accepted-control" } as Job);
  render(
    <ExampleContext.Provider value={preset}>
      <ComparisonForm language="en" onCreated={created} />
    </ExampleContext.Provider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("heading", { name: "2. Map protein chains" }),
  ).toBeVisible();
  const target = screen.getByRole("region", { name: "Target (alignment)" });
  await user.clear(
    within(target).getByRole("combobox", { name: "Reference chain 1" }),
  );
  await user.type(
    within(target).getByRole("combobox", { name: "Reference chain 1" }),
    "B",
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.clear(
    within(target).getByRole("combobox", { name: "Reference chain 1" }),
  );
  await user.type(
    within(target).getByRole("combobox", { name: "Reference chain 1" }),
    "A",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("heading", { name: "3. Choose comparison" }),
  ).toBeVisible();
  expect(
    screen.getByRole("combobox", { name: "How should residues be matched?" }),
  ).toHaveValue("author_numbering");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("heading", { name: "4. Review and run" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", {
      name: "Run structure comparison",
    }),
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "structure_compare",
      reference,
      moving,
      scientific_inputs: [reference, moving],
      options,
    }),
    expect.any(String),
  );
  expect(created).toHaveBeenCalledTimes(1);
});
