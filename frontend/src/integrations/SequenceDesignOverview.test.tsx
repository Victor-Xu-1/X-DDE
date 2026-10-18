import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SequenceDesignOverview } from "./SequenceDesignOverview";
import type { SequenceDesignResult } from "./sequence-design";

afterEach(cleanup);
const result: SequenceDesignResult = {
  original_sequence: "SNQ",
  selected_residues: [
    { identity: "A566", amino_acid: "S", minimum_ligand_distance_A: 2.573 },
  ],
  native_ligand_scored_residues: 0,
  native_ligand_score_cutoff_A: 8,
  sample_count: 2,
  unique_sequence_count: 1,
  wild_type_samples: 0,
  candidates: [
    {
      candidate_id: "sequence-002",
      first_identical_sample: "sequence-001",
      mutations: [{ residue: "A566", original: "S", designed: "T" }],
      overall_likelihood: 0.2,
      ligand_likelihood: null,
      sequence_recovery: 0,
    },
  ],
  scope: "conditional_sequence_likelihood_not_binding_probability",
};
it.each([true, false])(
  "shows sample multiplicity and an empty ligand mask without implying binding (%s)",
  (zh) => {
    render(
      <SequenceDesignOverview
        result={result}
        selected="sequence-002"
        zh={zh}
      />,
    );
    expect(screen.getByText("A566: S → T")).toBeVisible();
    expect(screen.getByText(/sequence-001/)).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent(
      zh ? "空评分掩码" : "empty score mask",
    );
    expect(
      screen.getByText(zh ? "不同序列" : "Distinct sequences"),
    ).toBeVisible();
  },
);
