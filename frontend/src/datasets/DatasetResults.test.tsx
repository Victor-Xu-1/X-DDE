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

it("preserves a quality tab when real primary data and real chart artifacts both exist", () => {
  render(
    <DatasetResults job={job} result={data("library", true)} language="en" />,
  );
  expect(screen.getByText("Native members: library")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Charts and quality" }),
  ).toBeVisible();
});
