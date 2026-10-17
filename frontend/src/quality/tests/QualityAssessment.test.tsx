import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  ["protein-ligand_maximum_distance", "smallest_distance_protein"],
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
it.each([-0.1, 1.1, Number.POSITIVE_INFINITY])(
  "does not accept an invalid overlap fraction %s",
  (value) => {
    const table = show(
      report("volume_overlap_with_waters", { volume_overlap_waters: value }),
    );
    expect(within(table).getByText("Not assessed")).toBeVisible();
  },
);
it.each([undefined, -1, 0.5, null, "0"])(
  "does not accept an invalid or missing feature count %s",
  (value) => {
    const table = show(
      report("aromatic_ring_flatness", {
        number_aromatic_rings_checked: value as number,
      }),
    );
    expect(within(table).getByText("Not assessed")).toBeVisible();
  },
);
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

it.each(["en", "zh"] as const)(
  "keeps source counts available without counting unassessed or inapplicable items as passes in %s",
  async (language) => {
    const native = report("bond_lengths", {
      number_bonds: 33,
      number_aromatic_rings_checked: 0,
    });
    native.checks.push(
      { id: "minimum_distance_to_waters", outcome: "pass" },
      { id: "aromatic_ring_flatness", outcome: "pass" },
      { id: "internal_energy", outcome: "unavailable" },
    );
    native.classification = "incomplete";
    const before = structuredClone(native);
    const user = userEvent.setup();
    const table = show(native, language);
    const zh = language === "zh";
    const summary = screen.getByRole("status", {
      name: zh ? "质控评估摘要" : "Quality assessment summary",
    });
    for (const text of zh
      ? ["通过: 1", "未评估: 1", "不适用: 1", "未能计算: 1"]
      : [
          "Pass: 1",
          "Not assessed: 1",
          "Not applicable: 1",
          "Not calculated: 1",
        ])
      expect(within(summary).getByText(text, { exact: true })).toBeVisible();
    const sourceCounts = screen.getByText(
      zh
        ? /原始报告：3 项通过，0 项需复核，1 项未能计算/
        : /Source report: 3 passed, 0 need review, 1 were not calculated/,
    );
    expect(sourceCounts).not.toBeVisible();
    await user.click(
      screen.getByText(zh ? "方法与评估范围" : "Method and assessment scope", {
        exact: true,
      }),
    );
    expect(sourceCounts).toBeVisible();
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: zh ? "显示哪些检查？" : "Which checks?",
      }),
      "pass",
    );
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(
      within(table).getByText(zh ? "通过" : "Pass", { exact: true }),
    ).toBeVisible();
    expect(
      within(table).queryByText(zh ? "未评估" : "Not assessed", {
        exact: true,
      }),
    ).toBeNull();
    expect(native).toEqual(before);
  },
);
