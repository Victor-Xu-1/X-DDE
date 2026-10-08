import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PoseResults } from "./PoseResults";
import type { PoseSet } from "./types";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: (props: unknown) => (
    <output data-testid="paired-preview">{JSON.stringify(props)}</output>
  ),
}));
vi.mock("../operations/PropertyForm", () => ({
  PropertyForm: (props: unknown) => (
    <output data-testid="property-input">{JSON.stringify(props)}</output>
  ),
}));
vi.mock("../docking/DockingForm", () => ({
  DockingForm: (props: unknown) => (
    <output data-testid="score-input">{JSON.stringify(props)}</output>
  ),
}));
vi.mock("./PoseScoreComparison", () => ({ PoseScoreComparison: () => null }));
afterEach(cleanup);
const reference = (asset: string, record = 0) => ({
  asset_id: asset,
  sha256: "a".repeat(64),
  version_id: asset + "-version",
  record,
  conformer: 0,
});
function value(id = "ensemble"): PoseSet {
  const combination = {
    step_id: "native-attempt",
    site_id: "site",
    member_index: 1,
    pocket_rank: 2,
    receptor: reference("paired-receptor", 1),
    ligand_index: 0,
    ligand: {
      reference: reference("input-ligand"),
      state_set_id: null,
      state_index: null,
      conformer_index: null,
    },
    seed: 42,
  };
  return {
    id,
    exploration_id: "exploration",
    run_id: "run",
    workflow_state: "complete",
    collection_status: "partial",
    qualified_pose_count: 2,
    outcomes: [
      {
        combination,
        job_id: "job",
        status: "succeeded",
        reason: null,
        software_version: "1.3",
        initial_conformer_generated: true,
        poses: [2, 5].map((record) => ({
          evidence: {
            record,
            valid: true,
            mapping_status: "matched",
            scores: [
              {
                name: "minimizedAffinity",
                value: -8.123456789,
                unit: "kcal/mol",
                direction: "lower",
              },
            ],
          },
          reference: reference("pose-" + record, record === 2 ? 1 : 3),
        })),
      },
      {
        combination: {
          ...combination,
          step_id: "failed-attempt",
          member_index: 2,
        },
        job_id: "failed-job",
        status: "failed",
        reason: "Native docking failed",
        software_version: null,
        initial_conformer_generated: null,
        poses: [],
      },
    ],
  };
}
const props = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);

it("keeps selected native pose and receptor records paired, with a real score and exact downloadable source", async () => {
  const user = userEvent.setup();
  render(<PoseResults value={value()} language="en" />);
  expect(screen.getByRole("button", { name: "Pose 3" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(props("paired-preview")).toMatchObject({
    urls: ["/api/assets/paired-receptor", "/api/assets/pose-2"],
    records: [1, 1],
    focusModel: 1,
  });
  await user.click(screen.getByRole("button", { name: "Pose 6" }));
  expect(props("paired-preview")).toMatchObject({
    urls: ["/api/assets/paired-receptor", "/api/assets/pose-5"],
    records: [1, 3],
  });
  expect(
    screen.getByRole("link", { name: "Download this pose" }),
  ).toHaveAttribute("href", "/api/assets/pose-5");
  expect(screen.getAllByTitle("-8.123456789")).toHaveLength(2);
  expect(screen.getAllByText("kcal/mol")).toHaveLength(2);
});

it("shows failed combinations without retaining a previous pose or disabling inspection of the failure", async () => {
  const user = userEvent.setup();
  render(<PoseResults value={value()} language="en" />);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Which combination?" }),
    "1",
  );
  expect(screen.getByText("Native docking failed")).toBeVisible();
  expect(screen.getByText("No pose to inspect")).toBeVisible();
  expect(screen.queryByTestId("paired-preview")).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open this native attempt" }),
  ).toHaveAttribute("href", "/#task=failed-job");
});

it("opens one fresh handoff page and returns to the same selected pose", async () => {
  const user = userEvent.setup();
  render(<PoseResults value={value()} language="en" />);
  await user.click(screen.getByRole("button", { name: "Pose 6" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate molecular properties" }),
  );
  expect(props("property-input").scientificInput).toEqual(
    reference("pose-5", 3),
  );
  expect(screen.queryByTestId("paired-preview")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(screen.getByRole("button", { name: "Pose 6" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(
    screen.getByRole("button", { name: "Rescore with paired receptor" }),
  );
  expect(props("score-input")).toMatchObject({
    mode: "score",
    initialReceptor: reference("paired-receptor", 1),
    initialLigand: reference("pose-5", 3),
  });
});

it("resets selection for a different ensemble and handles an empty collection", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<PoseResults value={value()} language="en" />);
  await user.click(screen.getByRole("button", { name: "Pose 6" }));
  rerender(<PoseResults value={value("different")} language="en" />);
  expect(screen.getByRole("button", { name: "Pose 3" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  rerender(
    <PoseResults
      value={{ ...value("empty"), outcomes: [], qualified_pose_count: 0 }}
      language="en"
    />,
  );
  expect(
    screen.getByText("No combination results have been collected."),
  ).toBeVisible();
});
