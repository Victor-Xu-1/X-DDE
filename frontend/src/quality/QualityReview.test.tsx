import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QualityReview } from "./QualityReview";
import type { PoseQualityTask, QualityProfile } from "./types";

vi.mock("../diffsbdd/ReviewReference", () => ({
  ReviewReference: ({
    reference,
  }: {
    reference: PoseQualityTask["molecule"];
  }) => (
    <span>
      {reference.asset_id} · record {reference.record + 1}
    </span>
  ),
}));

afterEach(cleanup);
const receptor = {
  asset_id: "Selected STAT6 receptor.pdb",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const molecule = {
  ...receptor,
  asset_id: "Selected pose collection.sdf",
  record: 2,
};
const reference = {
  ...receptor,
  asset_id: "Experimental reference.sdf",
  record: 1,
};
function request(profile: QualityProfile): PoseQualityTask {
  return {
    operation: "pose_quality",
    name: "Selected study",
    molecule,
    protein: profile === "mol" ? null : receptor,
    reference: profile === "redock" ? reference : null,
    coordinate_basis: profile === "mol" ? null : "user_confirmed",
    options: { profile, cpu: 2, memory_mib: 1024 },
  };
}

it("does not build an invalid request when the hidden review lacks its chosen inputs", () => {
  const getTask = vi.fn(() => {
    throw new Error("inputs not yet chosen");
  });
  render(<QualityReview language="en" enabled={false} getTask={getTask} />);
  expect(getTask).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).toBeNull();
});

it.each(["en", "zh"] as const)(
  "identifies the exact molecule, receptor and experimental records in %s",
  (language) => {
    render(
      <QualityReview
        language={language}
        enabled
        getTask={() => request("redock")}
      />,
    );
    const table = screen.getByRole("table", {
      name: language === "zh" ? "质检材料与方案" : "Quality materials and plan",
    });
    expect(
      within(table).getByText("Selected pose collection.sdf · record 3"),
    ).toBeVisible();
    expect(
      within(table).getByText("Selected STAT6 receptor.pdb · record 1"),
    ).toBeVisible();
    expect(
      within(table).getByText("Experimental reference.sdf · record 2"),
    ).toBeVisible();
    expect(within(table).getByText("Selected study")).toBeVisible();
    expect(
      within(table).getByText(
        language === "zh"
          ? "已确认与所选受体一致"
          : "Confirmed to match the selected receptor",
      ),
    ).toBeVisible();
    expect(screen.getByText("1024 MiB")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  },
);

it.each(["mol", "dock"] as const)(
  "does not show an unused experimental reference for %s",
  (profile) => {
    render(
      <QualityReview language="en" enabled getTask={() => request(profile)} />,
    );
    expect(screen.queryByText(/Experimental reference.sdf/)).toBeNull();
    if (profile === "mol")
      expect(screen.queryByText(/Selected STAT6 receptor/)).toBeNull();
    else expect(screen.getByText(/Selected STAT6 receptor/)).toBeVisible();
    expect(
      screen.getByText(
        profile === "mol" ? "Molecular conformation" : "Pose within a protein",
      ),
    ).toBeVisible();
  },
);

it("never invents a receptor-frame confirmation", () => {
  const value = { ...request("dock"), coordinate_basis: null };
  render(<QualityReview language="en" enabled getTask={() => value} />);
  expect(screen.getByText("Not confirmed")).toBeVisible();
  expect(
    screen.queryByText("Confirmed to match the selected receptor"),
  ).toBeNull();
});
