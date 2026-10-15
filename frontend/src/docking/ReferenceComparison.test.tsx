import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReferenceComparison } from "./ReferenceComparison";
import { PoseTable } from "./PoseTable";
import type { DockingResult } from "./types";

vi.mock("../diffsbdd/ReviewReference", () => ({
  ReviewReference: () => <span>Original reference · Record 1</span>,
}));
afterEach(cleanup);
const receptor = {
  asset_id: "r",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
function result(): DockingResult {
  return {
    operation: "docking",
    complete: true,
    mode: "dock",
    receptor,
    ligand: receptor,
    software_version: "1.3.3",
    pose_artifact: "qualified-poses.sdf",
    receptor_artifact: "receptor.pdb",
    scientific_outcome: "candidates",
    reference_comparison: {
      reference: receptor,
      role: "search_reference",
      status: "ready",
      method: "symmetry_aware_heavy_atom_no_fit",
      unit: "angstrom",
      heavy_atom_count: 71,
      contact_atom_count: 30,
      contact_cutoff_angstrom: 4,
      symmetry_mappings: 48,
    },
    poses: [
      {
        record: 0,
        valid: true,
        artifact: "pose-001.sdf",
        mapping_status: "native_atom_maps",
        scores: [
          {
            name: "minimizedAffinity",
            value: -8.62716,
            unit: "kcal/mol",
            direction: "lower",
          },
        ],
        reference_rmsd: { all_heavy: 10.656115977, contact: 4.460932549 },
      },
      {
        record: 1,
        valid: true,
        artifact: "pose-002.sdf",
        mapping_status: "native_atom_maps",
        scores: [],
        reference_rmsd: { all_heavy: 0, contact: 0 },
      },
    ],
  };
}
it.each(["en", "zh"] as const)(
  "explains reference distance without calling it affinity in %s",
  async (language) => {
    render(<ReferenceComparison result={result()} language={language} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByText(
        language === "zh"
          ? "与参考姿势比较"
          : "Compare with the reference pose",
      ),
    );
    expect(screen.getByText(/71/)).toBeVisible();
    expect(
      screen.getByText(
        language === "zh" ? /不拟合配体/ : /without fitting the ligand/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        language === "zh"
          ? /不表示亲和力或实验验证/
          : /not affinity or experimental validation/,
      ),
    ).toBeVisible();
  },
);
it("keeps each native pose's whole and contact RMSD selectable, sortable and distinct from its score", async () => {
  const onSelect = vi.fn();
  render(
    <PoseTable
      result={result()}
      language="en"
      selected={0}
      onSelect={onSelect}
      onDiagnostic={() => {}}
    />,
  );
  const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
  expect(within(table).getByText("10.656")).toBeVisible();
  expect(within(table).getByText("4.461")).toBeVisible();
  expect(within(table).getByText("-8.627")).toBeVisible();
  expect(within(table).getAllByText("0.000")).toHaveLength(2);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /^Pose 2$/ }));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({
      record: 1,
      reference_rmsd: { all_heavy: 0, contact: 0 },
    }),
  );
  await user.click(screen.getByRole("button", { name: /Whole-pose RMSD/ }));
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Pose 2");
});
it("leaves unavailable comparisons and legacy results without invented zero distances", async () => {
  const value = result();
  value.reference_comparison = {
    ...value.reference_comparison!,
    status: "different_chemical_state",
    contact_atom_count: null,
    symmetry_mappings: null,
  };
  value.poses.forEach((p) => {
    p.reference_rmsd = null;
  });
  const view = render(
    <>
      <ReferenceComparison result={value} language="en" />
      <PoseTable
        result={value}
        language="en"
        selected={0}
        onSelect={() => {}}
        onDiagnostic={() => {}}
      />
    </>,
  );
  expect(screen.queryByText("Whole-pose RMSD (Å)")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByText("Compare with the reference pose"));
  expect(screen.getByText(/pose RMSD was not calculated/)).toBeVisible();
  value.reference_comparison = undefined;
  view.rerender(<ReferenceComparison result={value} language="en" />);
  expect(screen.queryByText("Compare with the reference pose")).toBeNull();
});
