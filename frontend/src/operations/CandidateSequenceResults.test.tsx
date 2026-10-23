import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { CandidateSequenceResults } from "./CandidateSequenceResults";
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({ title }: { title: string }) => (
    <div role="application" aria-label={title} />
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div role="region" aria-label="Native structure">
      {urls.join("|")}
    </div>
  ),
}));
afterEach(cleanup);
const job: Job = {
  id: "fold-job",
  request: {
    operation: "harness",
    tool: "fold",
    name: "Fixture",
    payload: {},
    allow_external: true,
  },
  status: "succeeded",
  created_at: "2026-10-23T00:00:00Z",
  started_at: "2026-10-23T00:00:00Z",
  finished_at: "2026-10-23T00:00:01Z",
  error: null,
  parent_id: null,
};
it("starts with the selected candidate's exact structure and switches sequence/file together", async () => {
  const candidates = [
    {
      candidate_id: "binder-A",
      sequence: "EVQLVESGG",
      structure_path: "a.cif",
      metrics: { iptm: 0.32, ptm: 0.74, plddt: 0.707 },
    },
    {
      candidate_id: "binder-B",
      sequence: "DIQMTQSP",
      structure_path: "b.cif",
      metrics: { iptm: 0.5 },
    },
  ];
  const original = JSON.stringify(candidates);
  render(
    <CandidateSequenceResults
      job={job}
      language="en"
      candidates={candidates}
      structures={["b.cif", "a.cif"]}
    />,
  );
  expect(screen.getByRole("tab", { name: "3D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=a.cif");
  const user = userEvent.setup();
  await user.click(
    within(
      screen.getByRole("table", { name: "Sequence candidates" }),
    ).getByRole("button", { name: "binder-B" }),
  );
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=b.cif");
  await user.click(screen.getByRole("tab", { name: "Sequence comparison" }));
  expect(screen.getByText("DIQMTQSP")).toBeInTheDocument();
  expect(JSON.stringify(candidates)).toBe(original);
});
it("does not claim an equal-count file as a candidate pose; keeps unmatched files reachable", async () => {
  render(
    <CandidateSequenceResults
      job={job}
      language="en"
      candidates={[{ candidate_id: "unbound", sequence: "EVQL" }]}
      structures={["orphan.cif"]}
    />,
  );
  expect(
    screen.queryByRole("tab", { name: "3D structure" }),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByText("Other structure files · 1"));
  await userEvent.setup().click(screen.getByText("orphan.cif"));
  expect(
    screen.getByRole("region", { name: "Native structure" }),
  ).toHaveTextContent("name=orphan.cif");
});

it.each(["en", "zh"] as const)(
  "distinguishes repeated native samples from changed variants and displays design scores in %s",
  async (language) => {
    const native = ["AKDEF", "AKDEF", "AKDEF", "ACDEF"].map(
      (sequence, index) => ({
        sequence,
        chains: { A: sequence },
        risk_level: "low",
        metadata: {
          soluble_mpnn_scores: { A: [1.1, 1.2, 1.3, 2][index] },
          soluble_mpnn_seqids: { A: index === 3 ? 1 : 0.8 },
        },
      }),
    );
    const original = JSON.stringify(native);
    render(
      <CandidateSequenceResults
        job={{
          ...job,
          id: "native-samples",
          request: {
            operation: "harness",
            tool: "mpnn",
            name: "Fixture sample panel",
            allow_external: false,
            payload: { parent_chains: { A: "ACDEF" } },
          },
        }}
        candidates={native}
        structures={[]}
        language={language}
      />,
    );
    const counts = screen.getByRole("region", {
      name: language === "en" ? "Sequence diversity" : "序列多样性",
    });
    expect(within(counts).getByText("4")).toBeVisible();
    expect(within(counts).getByText("2")).toBeVisible();
    expect(within(counts).getByText("1")).toBeVisible();
    expect(within(counts).getByRole("status")).toHaveTextContent(
      language === "en" ? "3 native samples" : "3 次原生采样",
    );
    const table = screen.getByRole("table", {
      name: language === "en" ? "Sequence candidates" : "序列候选",
    });
    expect(within(table).getByText("1.1")).toBeVisible();
    expect(
      within(table).getByRole("button", {
        name:
          language === "en" ? "MPNN design score ↓ · A" : "MPNN 设计分数 ↓ · A",
      }),
    ).toBeVisible();
    await userEvent.setup().click(
      within(table).getByRole("button", {
        name: language === "en" ? "Candidate 4" : "候选 4",
      }),
    );
    expect(within(counts).getByRole("status")).toHaveTextContent(
      language === "en" ? "matches the parent" : "与起始序列相同",
    );
    expect(JSON.stringify(native)).toBe(original);
  },
);

it("resets candidate ownership when a different task replaces the displayed result", async () => {
  const candidates = [
    { candidate_id: "first", chains: { A: "ACDEF" } },
    { candidate_id: "second", chains: { A: "AKDEF" } },
  ];
  const props = { candidates, structures: [], language: "en" as const };
  const view = render(<CandidateSequenceResults {...props} job={job} />);
  await userEvent
    .setup()
    .click(
      within(
        screen.getByRole("table", { name: "Sequence candidates" }),
      ).getByRole("button", { name: "second" }),
    );
  expect(screen.getByRole("heading", { name: "second" })).toBeVisible();
  view.rerender(
    <CandidateSequenceResults
      {...props}
      job={{ ...job, id: "another-task" }}
    />,
  );
  expect(screen.getByRole("heading", { name: "first" })).toBeVisible();
});
