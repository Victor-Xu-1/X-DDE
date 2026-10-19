import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { api } from "../api";
import type { Job } from "../types";
import { ProteinInterfaceForm } from "./ProteinInterfaceForm";

vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ label, onChange, value }: any) => (
    <div>
      <p>{value ? "Source chosen" : "Upload new file"}</p>
      <button
        onClick={() =>
          onChange({
            asset_id:
              label === "Complex 1"
                ? "11111111-1111-4111-8111-111111111111"
                : "22222222-2222-4222-8222-222222222222",
            sha256: "a".repeat(64),
            record: 0,
            conformer: 0,
            version_id: null,
          })
        }
        type="button"
      >
        Choose {label}
      </button>
    </div>
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ onSceneLoaded, sourceSnapshot }: any) => (
    <button
      type="button"
      onClick={() =>
        onSceneLoaded({ chains: ["A", "B"], residues: [], ligands: [] })
      }
      data-snapshot={String(sourceSnapshot)}
    >
      Read model chains
    </button>
  ),
}));

it("starts with a new input and submits exact source lineage and disjoint chains through the shared queue", async () => {
  const user = userEvent.setup(),
    created = vi.fn();
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "native-interface-job" } as Job);
  render(<ProteinInterfaceForm language="en" onCreated={created} />);
  expect(screen.getByText("Upload new file")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose Complex 1" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Read model chains" }));
  await user.click(
    within(
      screen.getByRole("group", { name: "Target protein" }),
    ).getByLabelText("Chain A"),
  );
  expect(
    within(
      screen.getByRole("group", { name: "Binding partner" }),
    ).getByLabelText("Chain A"),
  ).toBeDisabled();
  await user.click(
    within(
      screen.getByRole("group", { name: "Binding partner" }),
    ).getByLabelText("Chain B"),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Analyze protein interface" }),
  );
  const task = submit.mock.calls[0][0] as any;
  expect(task.operation).toBe("protein_interface");
  expect(task.payload).toEqual({
    kind: "plip",
    scope: "protein_interface",
    target_chains: ["A"],
    binder_chains: ["B"],
    candidate_names: ["Complex 1"],
  });
  expect(task.scientific_inputs).toEqual(task.inputs.map((i: any) => i.source));
  expect(task.inputs[0].source.version_id).toBeNull();
  expect(created).toHaveBeenCalledTimes(1);
});

it("retains the three-complex comparison bound without a hidden fourth input", async () => {
  const user = userEvent.setup();
  render(<ProteinInterfaceForm language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Add comparison complex" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Add comparison complex" }),
  );
  expect(
    screen.queryByRole("button", { name: "Add comparison complex" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByLabelText("Complex name")).toHaveLength(3);
  await user.click(
    screen.getAllByRole("button", { name: "Remove this complex" })[1],
  );
  expect(screen.getAllByLabelText("Complex name")).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Add comparison complex" }),
  ).toBeEnabled();
});
