import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { TargetResearchResult } from "./types";
import { TargetResearchResults } from "./TargetResearchResults";
afterEach(cleanup);
it("does not hand off unsupported or unregistered sequences as supported prediction drafts", () => {
  const result = {
    request: { entity: "target" },
    entity: { id: "ENSG00000133703" },
    sources: [],
    materials: [
      {
        accession: "P01116",
        sequence: "MTEYK",
        artifact: "P01116.fasta",
        structures: [],
        structure_total: 0,
      },
    ],
    activities: null,
    retrieved_at: "2026-10-01T00:00:00Z",
  } as unknown as TargetResearchResult;
  const draft = vi.fn();
  const { rerender } = render(
    <TargetResearchResults
      job={{ id: "job" } as Job}
      result={result}
      language="en"
      onDraft={draft}
    />,
  );
  expect(
    screen.getByRole("button", {
      name: "Predict structure from this sequence",
    }),
  ).toBeDisabled();
  const material = {
    ...result.materials[0],
    reference: {
      asset_id: "file",
      sha256: "a".repeat(64),
      record: 0,
      conformer: 0,
      version_id: "version",
    },
    sequence: "MTU",
  };
  rerender(
    <TargetResearchResults
      job={{ id: "job" } as Job}
      result={{ ...result, materials: [material] }}
      language="en"
      onDraft={draft}
    />,
  );
  expect(
    screen.getByRole("button", {
      name: "Predict structure from this sequence",
    }),
  ).toBeDisabled();
  expect(draft).not.toHaveBeenCalled();
});
