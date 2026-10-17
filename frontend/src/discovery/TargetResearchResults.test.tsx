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

it.each(["en", "zh"] as const)(
  "shows only requested disease evidence in %s",
  (language) => {
    // A two-row presentation fixture, not a claimed full scientific query.
    const result = {
      request: { entity: "disease" },
      entity: {
        id: "MONDO_0004979",
        name: "asthma",
        associatedTargets: {
          count: 7772,
          rows: [
            {
              target: {
                id: "ENSG00000143631",
                approvedSymbol: "FLG",
                approvedName: "filaggrin",
              },
              score: 0.7491090795778099,
            },
            {
              target: {
                id: "ENSG00000077238",
                approvedSymbol: "IL4R",
                approvedName: "interleukin 4 receptor",
              },
              score: 0.746773466615787,
            },
          ],
        },
      },
      sources: [{ source: "Open Targets", status: "ok" }],
      materials: [],
      activities: null,
      retrieved_at: "2026-10-17T16:44:22Z",
    } as unknown as TargetResearchResult;
    render(
      <TargetResearchResults
        job={{ id: "protocol" } as Job}
        result={result}
        language={language}
      />,
    );
    expect(screen.getByText("7772")).toBeVisible();
    expect(
      screen.getByText(
        language === "zh" ? "本次获取" : "Retrieved associations",
      ),
    ).toBeVisible();
    expect(screen.getByText("IL4R")).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        language === "zh" ? "实验结构索引" : "Structure references",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        language === "zh" ? "实测活性记录" : "Reported activity records",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("table", {
        name: language === "zh" ? "关联证据" : "Association evidence",
      }),
    ).toBeVisible();
  },
);

it("keeps unavailable disease evidence unknown rather than reporting zero findings", () => {
  const result = {
    request: { entity: "disease" },
    entity: { id: "MONDO_0004979", name: "asthma" },
    sources: [
      {
        source: "Open Targets",
        status: "unavailable",
        reason: "Source temporarily unavailable",
      },
    ],
    materials: [],
    activities: null,
    retrieved_at: "2026-10-17T16:44:22Z",
  } as unknown as TargetResearchResult;
  render(
    <TargetResearchResults
      job={{ id: "protocol" } as Job}
      result={result}
      language="en"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Source temporarily unavailable",
  );
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
