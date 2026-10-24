import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { GenerationRejections } from "./GenerationRejections";
import type { CoreVerificationData } from "./types";

afterEach(cleanup);
const verification: CoreVerificationData = {
  method: "rdkit_fixed_core_attachments_v2",
  attachment_policy: "original_cuts",
  preserve_bonds: true,
  qualified_count: 0,
  qualified_sha256: "a".repeat(64),
  candidates: [
    {
      record: 0,
      qualified_record: null,
      diagnostic_artifact: "diagnostic-core-001.sdf",
      status: "failed",
      reason: "unexpected_core_attachment",
      maximum_displacement: null,
      mapping: [],
    },
  ],
};
it.each(["en", "zh"] as const)(
  "accounts for chemical and original-site exclusions using actual attempt identities in %s",
  async (language) => {
    const report = {
      rejected: [
        { attempt: 1, reason: "RDKit sanitization: Explicit valence C,5" },
        { attempt: 3, reason: "RDKit sanitization: Explicit valence O,3" },
      ],
      molecules: [{ attempt: 2 }],
    };
    const before = JSON.stringify({ report, verification });
    render(
      <GenerationRejections
        report={report}
        verification={verification}
        language={language}
      />,
    );
    await userEvent
      .setup()
      .click(
        screen.getByText(
          language === "zh"
            ? "为什么没有有效候选？"
            : "Why were no candidates accepted?",
        ),
      );
    const table = screen.getByRole("table", {
      name: language === "zh" ? "候选排除原因" : "Candidate exclusion reasons",
      hidden: true,
    });
    const rows = within(table).getAllByRole("row", { hidden: true });
    expect(rows).toHaveLength(4);
    expect(
      rows.slice(1).map((row) => row.querySelector("td")?.textContent),
    ).toEqual(
      language === "zh"
        ? ["采样 1", "采样 2", "采样 3"]
        : ["Attempt 1", "Attempt 2", "Attempt 3"],
    );
    expect(rows[2]).toHaveTextContent(
      language === "zh" ? "未允许的核心位置" : "outside the allowed core sites",
    );
    expect(table).not.toHaveTextContent(
      /RDKit|sanitization|unexpected_core_attachment/,
    );
    expect(JSON.stringify({ report, verification })).toBe(before);
  },
);
it("does not mistake a processed record number for an absent sampling attempt", async () => {
  render(
    <GenerationRejections
      report={{ molecules: [{}], rejected: [] }}
      verification={{
        ...verification,
        candidates: [
          {
            ...verification.candidates[0],
            status: "indeterminate",
            reason: "mapping_budget_exhausted",
          },
        ],
      }}
      language="en"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText("Why were no candidates accepted?"));
  expect(screen.getByText("Structure 1")).toBeInTheDocument();
  expect(screen.queryByText("Attempt 1")).toBeNull();
  expect(screen.getByText(/could not be verified/)).toBeInTheDocument();
});
it("does not invent chemical exclusions for missing or malformed native evidence", async () => {
  render(
    <GenerationRejections
      report={{ rejected: [null, 7, "private raw error"], molecules: null }}
      verification={{
        ...verification,
        candidates: [
          { ...verification.candidates[0], status: "passed", reason: null },
        ],
      }}
      language="en"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText("Why were no candidates accepted?"));
  expect(screen.queryByRole("table", { hidden: true })).toBeNull();
  expect(
    screen.getByText(/did not provide specific exclusion reasons/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/private raw error/)).toBeNull();
});
