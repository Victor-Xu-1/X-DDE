import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DatasetResults } from "./DatasetResults";
import type { DatasetResult } from "./types";
import type { Job } from "../types";

vi.mock("./ResearchTable", () => ({
  ResearchTable: ({ view }: { view: string }) => (
    <div>Native members: {view}</div>
  ),
}));
vi.mock("./DatasetCharts", () => ({
  DatasetCharts: () => <div>Native chart</div>,
}));
vi.mock("./CandidateView", () => ({
  CandidateView: () => <div>Native candidates</div>,
}));
afterEach(cleanup);
const job = { id: "study" } as Job;
const data = (
  kind: DatasetResult["data_kind"],
  charts = false,
): DatasetResult => ({
  operation: "drugclip_index",
  program: "drugclip",
  version: "1",
  schema_version: 1,
  complete: true,
  request_sha256: "a".repeat(64),
  data_kind: kind,
  artifacts: charts
    ? [
        {
          name: "quality.json",
          role: "independent_holdout_evaluation",
          format: "json",
          sha256: "b".repeat(64),
          size: 100,
        },
      ]
    : [],
  counts: { indexed: 177, shards: 18, unresolved_structures: 0 },
  candidates: [],
  metrics: {},
  metadata: {},
  warnings: [],
  molecule_artifact: null,
  scope: "computed_data_not_experimental_affinity",
});

it("presents actual indexed members without placeholder plots, dead tabs or shard counters", () => {
  render(<DatasetResults job={job} result={data("index")} language="en" />);
  expect(screen.getByText("Native members: index")).toBeVisible();
  expect(screen.getByText("Searchable molecules")).toBeVisible();
  expect(screen.queryByText("Molecule shards")).toBeNull();
  expect(screen.queryByText("Unresolved structures")).toBeNull();
  expect(screen.queryByText("Native chart")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Charts and quality" }),
  ).toBeNull();
});

it("shows chart-only model results directly without two identical result tabs", () => {
  render(
    <DatasetResults job={job} result={data("model", true)} language="en" />,
  );
  expect(screen.getByText("Native chart")).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Results$/ })).toBeNull();
});

it("offers decoded member observations before the separate quality view without calling them unique molecules", () => {
  const result = {
    ...data("decoded", true),
    counts: {
      input_reads: 1000,
      decoded_reads: 710,
      distinct_umi_records: 703,
    },
  };
  render(<DatasetResults job={job} result={result} language="en" />);
  expect(screen.getByText("Native members: decoded")).toBeVisible();
  expect(screen.getByText("UMI observations")).toBeVisible();
  expect(screen.queryByText("Distinct UMIs")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Charts and quality" }),
  ).toBeVisible();
});

it("keeps UMI exclusions visible in count summaries instead of spending space on matrix bookkeeping", () => {
  const result = {
    ...data("counts"),
    operation: "del_count" as const,
    counts: {
      counted_reads: 710,
      observed_members: 701,
      member_sample_pairs: 701,
      samples: 1,
      complete_umi_reads: 709,
      excluded_umi_reads: 1,
    },
  };
  render(<DatasetResults job={job} result={result} language="en" />);
  expect(screen.getByText("Complete-UMI reads")).toBeVisible();
  expect(screen.getByText("Excluded from UMI deduplication")).toBeVisible();
  expect(screen.queryByText("Member/sample pairs")).toBeNull();
});

it("opens prepared libraries in the shared native member inspector", () => {
  render(<DatasetResults job={job} result={data("library")} language="en" />);
  expect(
    screen.getByRole("region", { name: "Library member inspection" }),
  ).toBeVisible();
});

it("preserves a quality tab when real primary data and real chart artifacts both exist", () => {
  render(
    <DatasetResults job={job} result={data("library", true)} language="en" />,
  );
  expect(screen.getByText("Native members: library")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Charts and quality" }),
  ).toBeVisible();
});
