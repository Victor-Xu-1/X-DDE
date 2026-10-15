import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { QualityForm } from "../QualityForm";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), ready: true }));
vi.mock("../../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: mocks.ready, error: "" }),
}));
vi.mock("../../operations/useTaskSubmit", () => ({
  useTaskSubmit: () => ({ submit: mocks.submit, busy: false, error: "" }),
}));
vi.mock("../../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("../../diffsbdd/ReviewReference", () => ({
  ReviewReference: ({
    reference,
  }: {
    reference: { asset_id: string; record: number };
  }) => (
    <span>
      {reference.asset_id} · record {reference.record + 1}
    </span>
  ),
}));
const molecule = {
  asset_id: "molecule",
  sha256: "a".repeat(64),
  record: 2,
  conformer: 0,
  version_id: "version",
};
beforeEach(() => {
  mocks.ready = true;
  mocks.submit.mockReset();
});
it("shows one page and submits the exact molecular record only after review", async () => {
  render(
    <QualityForm
      language="zh"
      onCreated={vi.fn()}
      initialMolecule={molecule}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "开始质控" }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "pose_quality",
        molecule,
        scientific_inputs: [molecule],
        protein: null,
        coordinate_basis: null,
      }),
    ),
  );
});
it("requires explicit receptor-frame confirmation and preserves inputs on Back", () => {
  render(
    <QualityForm
      language="zh"
      onCreated={vi.fn()}
      initialMolecule={molecule}
      initialProtein={{ ...molecule, asset_id: "protein", record: 0 }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "这些分子姿势与所选蛋白处于同一坐标系",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "上一步" }));
  expect(
    screen.getByRole("checkbox", {
      name: "这些分子姿势与所选蛋白处于同一坐标系",
    }),
  ).toBeChecked();
});
it("blocks submission when the independent quality environment is unavailable", () => {
  mocks.ready = false;
  render(
    <QualityForm
      language="en"
      onCreated={vi.fn()}
      initialMolecule={molecule}
    />,
  );
  for (let i = 0; i < 3; i++)
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Check pose quality" }),
  ).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("reviews the current purpose and excludes a retained receptor after switching to molecular checks", async () => {
  render(
    <QualityForm
      language="en"
      onCreated={vi.fn()}
      initialMolecule={molecule}
      initialProtein={{ ...molecule, asset_id: "protein", record: 0 }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "These poses share the selected protein coordinate frame",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("table", { name: "Quality materials and plan" }),
  ).toHaveTextContent("protein · record 1");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(
    screen.getByRole("radio", { name: "Molecular conformation" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const review = screen.getByRole("table", {
    name: "Quality materials and plan",
  });
  expect(review).toHaveTextContent("molecule · record 3");
  expect(review).not.toHaveTextContent("protein · record 1");
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check pose quality" }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        molecule,
        protein: null,
        reference: null,
        coordinate_basis: null,
        scientific_inputs: [molecule],
        options: expect.objectContaining({ profile: "mol" }),
      }),
    ),
  );
});
