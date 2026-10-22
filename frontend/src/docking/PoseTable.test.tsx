import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PoseTable } from "./PoseTable";
import type { DockingResult } from "./types";

afterEach(cleanup);

// Interface fixtures; not scientific validation of these arbitrary scores.
function result(): DockingResult {
  const reference = {
    asset_id: "receptor",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  };
  return {
    operation: "docking",
    complete: true,
    mode: "dock",
    receptor: reference,
    ligand: { ...reference, asset_id: "ligand" },
    software_version: "1.3.3",
    pose_artifact: "poses.sdf",
    receptor_artifact: "receptor.pdb",
    scientific_outcome: "candidates",
    poses: [-7.431, -6.218].map((value, record) => ({
      record,
      valid: true,
      artifact: `pose-${record + 1}.sdf`,
      mapping_status: "ambiguous_reconfirm_selections",
      scores: [
        {
          name: "minimizedAffinity",
          value,
          unit: "kcal/mol",
          direction: "lower",
        },
        {
          name: "CNNscore",
          value: 0.792,
          unit: "model_output",
          direction: "higher",
        },
        {
          name: "CNNaffinity",
          value: 6.273,
          unit: "model_output",
          direction: "higher",
        },
      ],
    })),
  };
}

it.each(["en", "zh"] as const)(
  "%s starts with native scores and units, leaving repeated bookkeeping optional",
  (language) => {
    const value = result();
    render(
      <PoseTable
        result={value}
        language={language}
        selected={1}
        onSelect={vi.fn()}
        onDiagnostic={vi.fn()}
      />,
    );
    const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(
      within(table).getByRole("columnheader", { name: /kcal\/mol/ }),
    ).toBeVisible();
    expect(within(table).getByText("-7.431")).toBeVisible();
    expect(within(table).getAllByText("0.792")).toHaveLength(2);
    expect(within(table).getAllByText("6.273")).toHaveLength(2);
    expect(
      within(table).queryByRole("columnheader", {
        name: language === "zh" ? "原子映射" : "Atom mapping",
      }),
    ).toBeNull();
    expect(
      within(table).queryByRole("columnheader", {
        name: language === "zh" ? "状态" : "Status",
      }),
    ).toBeNull();
  },
);

it.each(["en", "zh"] as const)(
  "%s restores optional columns and core metrics without changing the selected native record",
  async (language) => {
    const value = result(),
      onSelect = vi.fn();
    const original = JSON.stringify(value);
    render(
      <PoseTable
        result={value}
        language={language}
        selected={1}
        onSelect={onSelect}
        onDiagnostic={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByText(language === "zh" ? "显示指标" : "Columns", {
        exact: true,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: language === "zh" ? "原子映射" : "Atom mapping",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: language === "zh" ? "状态" : "Status",
      }),
    );
    const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
    expect(
      within(table).getAllByText(
        language === "zh" ? "重选原子区域" : "Reselect atom regions",
      ),
    ).toHaveLength(2);
    expect(
      within(table).getAllByText(
        language === "zh" ? "可复用候选" : "Reusable candidate",
      ),
    ).toHaveLength(2);
    const row = within(table).getByRole("row", {
      name: language === "zh" ? /姿势 2/ : /Pose 2/,
    });
    expect(row).toHaveAttribute("aria-selected", "true");
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "常用指标" : "Core metrics",
      }),
    );
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    await user.click(row);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(value.poses[1]);
    expect(JSON.stringify(value)).toBe(original);
  },
);

it("keeps rejected poses and failed hard constraints visible and non-reusable", async () => {
  const value = result(),
    onSelect = vi.fn(),
    onDiagnostic = vi.fn();
  value.poses[0] = {
    ...value.poses[0],
    valid: false,
    artifact: undefined,
    diagnostic_artifact: "rejected-heavy.sdf",
    constraint_checks: [
      {
        condition_id: "region",
        passed: false,
        strength: "hard",
        selection: "all_heavy_atoms",
        unit: "angstrom",
        maximum_excess: 1.234,
        tolerance_angstrom: 0.1,
        checked_points: 28,
        violations: [],
      },
    ],
  };
  render(
    <PoseTable
      result={value}
      language="en"
      selected={1}
      onSelect={onSelect}
      onDiagnostic={onDiagnostic}
    />,
  );
  const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
  expect(
    within(table).getByRole("columnheader", { name: "Status" }),
  ).toBeVisible();
  expect(
    within(table).getByText("Excluded: hard spatial condition failed"),
  ).toBeVisible();
  expect(within(table).getByText(/1\.234 Å/)).toBeVisible();
  const rejected = within(table).getByRole("row", { name: /Pose 1/ });
  expect(
    within(rejected).getByRole("button", { name: "Pose 1", exact: true }),
  ).toBeDisabled();
  await userEvent.click(rejected);
  expect(onSelect).not.toHaveBeenCalled();
  await userEvent.click(
    within(rejected).getByRole("button", { name: "Inspect rejected pose" }),
  );
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith("rejected-heavy.sdf");
});

it.each([true, false])(
  "shows evaluated spatial conditions even for valid poses: passed=%s",
  (passed) => {
    const value = result();
    value.poses[0].constraint_checks = [
      {
        condition_id: "region",
        passed,
        strength: passed ? "hard" : "soft",
        selection: "all_heavy_atoms",
        unit: "angstrom",
        maximum_excess: passed ? 0 : 2.75,
        tolerance_angstrom: 0.1,
        checked_points: 28,
        violations: [],
      },
    ];
    render(
      <PoseTable
        result={value}
        language="en"
        selected={0}
        onSelect={vi.fn()}
        onDiagnostic={vi.fn()}
      />,
    );
    const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
    expect(
      within(table).getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();
    expect(
      within(table).getByText(
        passed ? /Spatial condition passed/ : /Spatial condition failed/,
      ),
    ).toBeVisible();
    expect(
      within(table).getByText(passed ? /0\.000 Å/ : /2\.750 Å/),
    ).toBeVisible();
  },
);

it("keeps status and unavailable mapping visible when a legacy result contains no score columns", () => {
  const value = result();
  value.poses.forEach((pose) => {
    pose.scores = [];
    pose.mapping_status = "unavailable";
  });
  render(
    <PoseTable
      result={value}
      language="en"
      selected={0}
      onSelect={vi.fn()}
      onDiagnostic={vi.fn()}
    />,
  );
  const table = screen.getByRole("table", { name: "GNINA 1.3.3" });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
  expect(
    within(table).getByRole("columnheader", { name: "Status" }),
  ).toBeVisible();
  expect(
    within(table).getByRole("columnheader", { name: "Atom mapping" }),
  ).toBeVisible();
  expect(within(table).getAllByText("—")).toHaveLength(2);
});
