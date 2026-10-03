import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { HumanizationResults } from "./HumanizationResults";
import type { HumanizationResult } from "./types";

vi.mock("./HumanizationForm", () => ({
  HumanizationForm: () => <div>Exact candidate evaluation</div>,
}));
afterEach(cleanup);
const ref = {
  asset_id: "candidate",
  sha256: "b".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "candidate-version",
};
const result = {
  operation: "antibody_humanize",
  options: { mode: "framework" },
  vhh_scope: "conventional_vh_vl",
  versions: { sapiens: "1.1.0", anarcii: "2.0.8", promb: "1.0.2" },
  rows: [
    {
      record: 0,
      source_id: "source",
      status: "evaluated",
      source_sequence: "ACD",
      proposal: "YCD",
      reason: null,
      reference: ref,
      artifact: "humanized-001.fasta",
      original_evaluation: {
        mean_native_residue_probability: 0.04,
        oas_peptide_fraction: 0.5,
        matched_peptides: 1,
        total_peptides: 2,
      },
      proposal_evaluation: {
        mean_native_residue_probability: 0.08,
        oas_peptide_fraction: 1,
        matched_peptides: 2,
        total_peptides: 2,
      },
      numbering: ["A", "C", "D"].map((amino_acid, index) => ({
        amino_acid,
        source_position: index + 1,
        number: index + 1,
        insertion: "",
        region: "framework",
      })),
    },
  ],
} as unknown as HumanizationResult;
const job = { id: "actual-task" } as Job;
it("shows separate native metrics and only hands off the actual changed version", async () => {
  const onDraft = vi.fn(),
    user = userEvent.setup();
  render(
    <HumanizationResults
      job={job}
      result={result}
      language="en"
      onDraft={onDraft}
      onCreated={vi.fn()}
    />,
  );
  expect(screen.getByText("0.0400")).toBeVisible();
  expect(screen.getByText("1 / 2 (50.0%)")).toBeVisible();
  expect(
    screen.getByRole("table", { name: "1 final changed positions" }),
  ).toHaveTextContent("Y");
  await user.click(
    screen.getByRole("button", { name: "Predict this candidate structure" }),
  );
  expect(onDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      scientific_inputs: [ref],
      components: [
        expect.objectContaining({ value: "YCD", source_sequence: "candidate" }),
      ],
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Evaluate this candidate again" }),
  );
  expect(screen.getByText("Exact candidate evaluation")).toBeVisible();
  expect(
    screen.queryByRole("table", { name: "1 final changed positions" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(
    screen.getByRole("table", { name: "1 final changed positions" }),
  ).toHaveTextContent("Y");
});
it("does not fabricate candidates for failed records", () => {
  const failed = {
    ...result,
    rows: [
      {
        ...result.rows[0],
        status: "failed",
        proposal: null,
        reference: undefined,
        artifact: null,
        reason: "unsupported_variable_region_input",
      },
    ],
  } as HumanizationResult;
  render(
    <HumanizationResults
      job={job}
      result={failed}
      language="en"
      onDraft={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "70–200 standard amino acids",
  );
  expect(
    screen.queryByRole("button", { name: "Predict this candidate structure" }),
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Download proposed FASTA" }),
  ).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});
