import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DockingReview } from "./DockingReview";
import { defaults } from "./generated";
import type { DockingTask } from "./types";

vi.mock("../diffsbdd/ReviewReference", () => ({
  ReviewReference: ({ reference }: { reference: DockingTask["ligand"] }) => (
    <span>
      {reference.asset_id} · record {reference.record + 1}
    </span>
  ),
}));
afterEach(cleanup);
const receptor = {
  asset_id: "chosen-receptor.pdb",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const ligand = { ...receptor, asset_id: "selected-series.sdf", record: 2 };
const reference = {
  ...receptor,
  asset_id: "experimental-reference.sdf",
  record: 1,
};
function request(): DockingTask {
  return {
    operation: "docking",
    name: "Selected study",
    mode: "dock",
    receptor,
    ligand,
    search: {
      kind: "reference_ligand",
      frame: receptor,
      reference,
      coordinate_basis: "user_confirmed",
    },
    pose_frame: null,
    pose_coordinate_basis: null,
    options: {
      ...defaults,
      cpu: 3,
      memory_mib: 2048,
      seed: 431,
      num_modes: 17,
      autobox_add: 6,
    },
  };
}
it("does not build an invalid draft while the questionnaire's hidden review is mounted", () => {
  const getTask = vi.fn(() => {
    throw new Error("inputs not chosen");
  });
  render(<DockingReview getTask={getTask} enabled={false} language="en" />);
  expect(getTask).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).toBeNull();
});
it.each(["en", "zh"] as const)(
  "reviews actual selected records and effective settings in %s",
  (language) => {
    const value = request();
    render(<DockingReview getTask={() => value} enabled language={language} />);
    const table = screen.getByRole("table", {
      name:
        language === "zh" ? "材料与计算方案" : "Materials and calculation plan",
    });
    expect(
      within(table).getByText("selected-series.sdf · record 3"),
    ).toBeVisible();
    expect(
      within(table).getByText("experimental-reference.sdf · record 2"),
    ).toBeVisible();
    expect(within(table).getByText("CPU × 3")).toBeVisible();
    expect(table).toHaveTextContent("17");
    expect(table).toHaveTextContent("6 Å");
    expect(
      screen.getByText(
        language === "zh"
          ? /不再根据分子大小自动扩大/
          : /without automatic expansion/,
      ),
    ).toBeVisible();
    expect(screen.getByText("431")).toBeInTheDocument();
    expect(screen.getByText("2048 MiB")).toBeInTheDocument();
  },
);
it("reviews explicit box values and omits an unused reference ligand", () => {
  const value = request();
  value.search = {
    kind: "box",
    frame: receptor,
    box: { center: [11, 22, 33], size: [24, 26, 28], unit: "angstrom" },
  };
  render(<DockingReview getTask={() => value} enabled language="en" />);
  expect(screen.getByText("11 / 22 / 33 Å")).toBeVisible();
  expect(screen.getByText("24 × 26 × 28 Å")).toBeVisible();
  expect(screen.queryByText(/experimental-reference/)).toBeNull();
});
it.each(["score", "minimize"] as const)(
  "never calls existing-pose %s a global docking search",
  (mode) => {
    const value = {
      ...request(),
      mode,
      search: null,
      pose_frame: receptor,
      pose_coordinate_basis: "user_confirmed" as const,
    };
    render(<DockingReview getTask={() => value} enabled language="en" />);
    expect(screen.getByText(/Confirmed to match/)).toBeVisible();
    expect(
      screen.queryByText("Exhaustiveness 8 · at most 17 poses"),
    ).toBeNull();
    expect(screen.queryByText(/experimental-reference/)).toBeNull();
    expect(screen.queryByText(/without automatic expansion/)).toBeNull();
    expect(
      screen.getByText(
        mode === "score" ? /coordinates unchanged/ : /original pose retained/,
      ),
    ).toBeVisible();
  },
);
