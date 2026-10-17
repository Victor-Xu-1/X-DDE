import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../../types";
import type { PoseQualityResult } from "../types";
import { QualityResults } from "../QualityResults";

vi.mock("../../viewer/StructureViewer", () => ({
  StructureViewer: () => <span>Native source view</span>,
}));
afterEach(cleanup);

function report(id: string, metrics: Record<string, number> = {}) {
  return {
    operation: "pose_quality",
    complete: true,
    schema_version: 1,
    inputs: {
      molecule: {
        asset_id: "molecule",
        sha256: "a".repeat(64),
        record: 0,
        conformer: 0,
      },
      protein: {
        asset_id: "protein",
        sha256: "b".repeat(64),
        record: 0,
        conformer: 0,
      },
    },
    coordinate_basis: "user_confirmed",
    versions: {},
    native_config_sha256: "a".repeat(64),
    classification: "passes",
    options: { profile: "dock", cpu: 1, memory_mib: 2048 },
    checks: [{ id, outcome: "pass" }],
    metrics,
    previews_sha256: {},
  } as PoseQualityResult;
}
function show(result: PoseQualityResult, language: "en" | "zh" = "en") {
  render(
    <QualityResults
      job={{ id: "native-case" } as Job}
      result={result}
      language={language}
    />,
  );
  return screen.getByRole("table", {
    name: language === "zh" ? "质控检查结果" : "Quality check outcomes",
  });
}

it.each(["en", "zh"] as const)(
  "does not turn a zero clash count without a measurement into an assessed pass in %s",
  (language) => {
    const native = report("minimum_distance_to_waters", {
      num_pairwise_clashes_waters: 0,
    });
    const before = structuredClone(native);
    Object.freeze(native.checks[0]);
    Object.freeze(native.checks);
    Object.freeze(native.metrics);
    Object.freeze(native);
    const table = show(native, language);
    expect(
      within(table).getByText(language === "zh" ? "未评估" : "Not assessed"),
    ).toBeVisible();
    expect(
      screen.queryByText(/All applicable checks passed|已通过全部适用检查/),
    ).toBeNull();
    expect(native).toEqual(before);
    expect(native.checks[0].outcome).toBe("pass");
  },
);

const contexts = [
  ["minimum_distance_to_protein", "smallest_distance_protein"],
  [
    "minimum_distance_to_organic_cofactors",
    "smallest_distance_organic_cofactors",
  ],
  [
    "minimum_distance_to_inorganic_cofactors",
    "smallest_distance_inorganic_cofactors",
  ],
  ["minimum_distance_to_waters", "smallest_distance_waters"],
  ["volume_overlap_with_protein", "volume_overlap_protein"],
  ["volume_overlap_with_organic_cofactors", "volume_overlap_organic_cofactors"],
  [
    "volume_overlap_with_inorganic_cofactors",
    "volume_overlap_inorganic_cofactors",
  ],
  ["volume_overlap_with_waters", "volume_overlap_waters"],
] as const;
it.each(contexts)("requires an actual measurement for %s", (check) => {
  expect(within(show(report(check))).getByText("Not assessed")).toBeVisible();
});
it.each(contexts)("retains a measured native pass for %s", (check, metric) => {
  const value = metric.startsWith("smallest_distance") ? 3.4 : 0;
  const table = show(report(check, { [metric]: value }));
  expect(within(table).getByText("Pass")).toBeVisible();
  expect(within(table).queryByText("Not assessed")).toBeNull();
});
it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "0", null])(
  "does not accept an invalid distance measurement %s",
  (value) => {
    const table = show(
      report("minimum_distance_to_waters", {
        smallest_distance_waters: value as number,
      }),
    );
    expect(within(table).getByText("Not assessed")).toBeVisible();
  },
);
it("does not infer a pass from a missing receptor source", () => {
  const native = report("minimum_distance_to_protein", {
    smallest_distance_protein: 3.4,
  });
  delete native.inputs.protein;
  expect(within(show(native)).getByText("Not assessed")).toBeVisible();
});
it("preserves a native failure even when its measurement is missing", () => {
  const native = report("minimum_distance_to_organic_cofactors");
  native.classification = "fails";
  native.checks[0].outcome = "fail";
  expect(within(show(native)).getByText("Needs review")).toBeVisible();
  expect(native.checks[0].outcome).toBe("fail");
});
it("marks a zero tested feature count as inapplicable, retaining the original flag", () => {
  const native = report("aromatic_ring_flatness", {
    number_aromatic_rings_checked: 0,
  });
  expect(within(show(native)).getByText("Not applicable")).toBeVisible();
  expect(native.checks[0].outcome).toBe("pass");
});
it("does not convert a failure into inapplicable when a feature count is zero", () => {
  const native = report("aromatic_ring_flatness", {
    number_aromatic_rings_checked: 0,
  });
  native.classification = "fails";
  native.checks[0].outcome = "fail";
  expect(within(show(native)).getByText("Needs review")).toBeVisible();
});
