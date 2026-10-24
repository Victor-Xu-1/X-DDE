import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Job } from "../types";
import { FoldAssessment } from "./FoldAssessment";
afterEach(cleanup);
const job: Job = {
  id: "native",
  status: "succeeded",
  created_at: "2026-10-24T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
  request: {
    operation: "harness",
    tool: "fold",
    name: "Fold control",
    allow_external: true,
    payload: { options: { binder_chain_ids: ["A"] } },
  },
};
const candidate = {
  metadata: {
    chains: { A: "EVQLV" },
    gate_passed: false,
    gate_evidence: {
      epitope_gate_skipped: true,
      epitope_gate_skip_reason: "no_hotspots_configured",
      cdr_position_semantics: "zero_based_sequence_order",
      binder_interface_residues: 5,
    },
  },
  metrics: {
    gate_passed: 0,
    cdr_contact_fraction: 0,
    framework_contact_fraction: 1,
  },
};
it.each(["en", "zh"] as const)(
  "shows native failure and missing evidence in %s without false zero-percent measurements",
  (language) => {
    render(
      <FoldAssessment job={job} candidate={candidate} language={language} />,
    );
    const panel = screen.getByRole("region", {
      name: language === "en" ? "Interface assessment" : "界面质量评估",
    });
    expect(within(panel).getByRole("status")).toHaveTextContent(
      language === "en"
        ? "Native interface check not passed"
        : "原生界面检查未通过",
    );
    expect(
      within(panel).getByText(
        language === "en" ? /annotations are missing/ : /缺少完整、有效的 CDR/,
      ),
    ).toBeVisible();
    expect(
      within(panel).getByText(
        language === "en"
          ? /no target residues were specified/
          : /未指定靶点残基/,
      ),
    ).toBeVisible();
    expect(within(panel).queryByText("0.0%")).not.toBeInTheDocument();
    expect(within(panel).queryByText("100.0%")).not.toBeInTheDocument();
  },
);
it("displays valid native fractions while retaining a failed native check", () => {
  render(
    <FoldAssessment
      language="en"
      candidate={candidate}
      job={
        {
          ...job,
          request: {
            ...job.request,
            payload: {
              options: { binder_chain_ids: ["A"], cdr_regions: { A: [0, 1] } },
            },
          },
        } as Job
      }
    />,
  );
  expect(screen.getByText("0.0%")).toBeVisible();
  expect(screen.getByText("100.0%")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("not passed");
});
it("keeps non-fold sequence design results free of a fold-specific assessment", () => {
  render(
    <FoldAssessment
      job={{ ...job, request: { ...job.request, tool: "mpnn" } } as Job}
      candidate={candidate}
      language="en"
    />,
  );
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
