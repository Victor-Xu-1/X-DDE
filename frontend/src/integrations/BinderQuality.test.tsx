import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BinderQuality } from "./BinderQuality";
import type { BinderQualityReport } from "./types";

vi.mock("../presentation/SequenceTrack", () => ({
  SequenceTrack: ({ sequence }: { sequence: string }) => (
    <output aria-label="Binder sequence">{sequence}</output>
  ),
}));
afterEach(cleanup);
const report: BinderQualityReport = {
  source_artifact:
    "native/designs/final_ranked_designs/all_designs_metrics.csv",
  source_sha256: "a".repeat(64),
  attempted: 4,
  passed: 0,
  retained: 2,
  designs: [0, 1, 2, 3].map((i) => ({
    native_id: `design_${i}.cif`,
    candidate_id: i === 3 ? "binder-001" : i === 1 ? "binder-002" : null,
    sequence: "WFDEAYKAATAA",
    passed: false,
    failed_filters: ["pass_ALA_fraction_filter"],
    interface_confidence: 0.62484,
    complex_confidence: 0.72505,
    binder_refold_confidence: 0.69724,
    binder_refold_rmsd: 0.50267,
    complex_refold_rmsd: 0.94295,
    buried_area: 1027.30518,
  })),
};
it.each(["en", "zh"] as const)(
  "shows actual native rejection totals, all designs and raw downloads in %s",
  (language) => {
    render(
      <BinderQuality
        report={report}
        jobId="real-study"
        selected="binder-001"
        language={language}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      language === "en"
        ? "0 / 4 designs pass native filters"
        : "0 / 4 条通过原生筛选",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      language === "en"
        ? "retention does not imply qualification"
        : "保留不等于合格",
    );
    expect(screen.getByLabelText("Binder sequence")).toHaveTextContent(
      "WFDEAYKAATAA",
    );
    expect(screen.getByText("69.7 / 100")).toBeVisible();
    fireEvent.click(
      screen.getByText(
        language === "en"
          ? "All designs and filter decisions"
          : "全部设计与筛选结论",
      ),
    );
    expect(screen.getAllByRole("row")).toHaveLength(5);
    expect(
      screen.getByRole("link", {
        name:
          language === "en"
            ? "Download complete native metrics CSV"
            : "下载完整原生指标 CSV",
      }),
    ).toHaveAttribute(
      "href",
      "/api/jobs/real-study/download?name=native%2Fdesigns%2Ffinal_ranked_designs%2Fall_designs_metrics.csv",
    );
    expect(
      screen.getAllByText(
        language === "en" ? "Excess alanine" : "丙氨酸比例过高",
      ).length,
    ).toBeGreaterThan(0);
  },
);
