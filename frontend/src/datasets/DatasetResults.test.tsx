import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DatasetResults } from "./DatasetResults";
import type { DatasetResult } from "./types";
import type { Job } from "../types";
import { nativeQuality } from "./sequencing-quality.test-data";

vi.mock("./ResearchTable", () => ({
  ResearchTable: ({
    view,
    comparisonControl,
  }: {
    view: string;
    comparisonControl?: ReactNode;
  }) => (
    <div>
      {comparisonControl}Native members: {view}
    </div>
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
const members: DatasetResult["candidates"] = [
  {
    id: "member",
    source_job: null,
    source_record: 0,
    supplier: "",
    smiles: "",
    score: 2,
    raw_score: null,
    docking_score: null,
    cnn_score: null,
    cnn_affinity: null,
    artifact: null,
    record: 0,
    geometry: "none",
  },
];
const data = (
  kind: DatasetResult["data_kind"],
  charts = false,
): DatasetResult => ({
  operation: kind === "index" ? "drugclip_index" : "del_validate",
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
  const counts = screen.getByText("Counts", { selector: "summary" }).parentElement!;
  expect(counts).not.toHaveAttribute("open");
  counts.setAttribute("open", "");
  expect(within(counts).getByText("Searchable molecules")).toBeVisible();
  expect(screen.queryByText("Molecule shards")).toBeNull();
  expect(screen.queryByText("Unresolved structures")).toBeNull();
  expect(screen.queryByText("Native chart")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Charts and quality" })).toBeNull();
});

it("shows chart-only model results directly without two identical result tabs", () => {
  render(
    <DatasetResults job={job} result={data("model", true)} language="en" />,
  );
  expect(screen.getByText("Native chart")).toBeVisible();
  expect(screen.queryByRole("tab", { name: /^Results$/ })).toBeNull();
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
  expect(screen.getByRole("tab", { name: "Charts and quality" })).toBeVisible();
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

it("distinguishes unassessed historical UMI counts from current assessed or explicit raw counts", () => {
  const result = {
    ...data("counts"),
    operation: "del_count" as const,
    metadata: { umi_method: "directional" },
  };
  const { rerender } = render(
    <DatasetResults job={job} result={result} language="en" />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "UMI completeness was not assessed",
  );
  rerender(
    <DatasetResults
      job={job}
      result={{
        ...result,
        metadata: {
          ...result.metadata,
          umi_integrity: nativeQuality.umi_integrity,
        },
      }}
      language="en"
    />,
  );
  expect(screen.queryByRole("status")).toBeNull();
  rerender(
    <DatasetResults
      job={job}
      result={{ ...result, metadata: { umi_method: "raw" } }}
      language="en"
    />,
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it("opens prepared libraries in the shared native member inspector", () => {
  render(<DatasetResults job={job} result={data("library")} language="en" />);
  expect(
    screen.getByRole("region", { name: "Library member inspection" }),
  ).toBeVisible();
});

it("keeps the enumerated member inspector and candidate structures in separate views", () => {
  render(
    <DatasetResults
      job={job}
      result={{
        ...data("library"),
        operation: "del_enumerate",
        candidates: members,
      }}
      language="en"
    />,
  );
  const inspection = screen.getByRole("region", {
    name: "Library member inspection",
  });
  expect(inspection).toBeVisible();
  expect(screen.queryByText("Native candidates")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Candidate structures" }));
  expect(inspection).not.toBeVisible();
  expect(screen.getByText("Native candidates")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Library members" }));
  expect(inspection).toBeVisible();
  expect(screen.getByText("Native candidates")).not.toBeVisible();
});

it("flags rejected library records while keeping exact result counts available", () => {
  render(
    <DatasetResults
      job={job}
      result={{
        ...data("library"),
        operation: "del_enumerate",
        counts: {
          enumerated: 4,
          failed: 0,
          source_records: 5,
          rejected_records: 1,
        },
      }}
      language="en"
    />,
  );
  const counts = screen
    .getByText("Review counts", { selector: "summary" })
    .closest("details")!;
  expect(counts).not.toHaveAttribute("open");
  expect(within(counts).getByText("Resolved structures")).not.toBeVisible();
  counts.setAttribute("open", "");
  expect(within(counts).getByText("Rejected records")).toBeVisible();
  expect(within(counts).getByText("1", { exact: true })).toBeVisible();
  expect(within(counts).getByText("Resolved structures")).toBeVisible();
});

it("keeps screening counts and result downloads together and flags late failures", () => {
  const result: DatasetResult = {
    ...data("index"),
    operation: "drugclip_index",
    artifacts: [{
      name: "members.csv",
      role: "compound_library",
      format: "csv",
      sha256: "c".repeat(64),
      size: 100,
    }],
    counts: {
      source_records: 50,
      valid_records: 49,
      unique_compounds: 48,
      duplicate_chemical_records: 1,
      indexed: 47,
      rejected: 2,
    },
  };
  render(<DatasetResults job={job} result={result} language="en" />);
  const counts = screen.getByText("Review counts", { selector: "summary" }).parentElement!;
  expect(counts).not.toHaveAttribute("open");
  expect(within(counts).getByText("Searchable molecules")).not.toBeVisible();
  expect(within(counts.parentElement!).getByText("Download results")).toBeVisible();
  counts.setAttribute("open", "");
  expect(within(counts).getByText("Encoding rejections")).toBeVisible();
  expect(within(counts).getByText("47", { exact: true })).toBeVisible();
});

it("preserves a quality tab when real primary data and real chart artifacts both exist", () => {
  render(
    <DatasetResults job={job} result={data("library", true)} language="en" />,
  );
  expect(screen.getByText("Native members: library")).toBeVisible();
  expect(screen.getByRole("tab", { name: "Charts and quality" })).toBeVisible();
});

it("opens DEL candidate structures from the result tabs while retaining the comparison", () => {
  const result: DatasetResult = {
    ...data("analysis", true),
    operation: "del_analyze",
    program: "deli",
    artifacts: [
      ...data("analysis", true).artifacts,
      {
        name: "evidence.csv",
        role: "del_comparison_evidence",
        format: "csv",
        sha256: "c".repeat(64),
        size: 20,
      },
    ],
    metadata: {
      chosen_comparison: "a",
      comparisons: [
        { id: "a", selection: "S1", reference: "R1" },
        { id: "b", selection: "S2", reference: "R2" },
      ],
    },
    candidates: members,
  };
  render(<DatasetResults job={job} result={result} language="en" />);
  expect(screen.queryByText("Native candidates")).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Comparison" }), {
    target: { value: "b" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Candidate structures" }));
  expect(screen.getByText("Native candidates")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  expect(screen.getByRole("combobox", { name: "Comparison" })).toHaveValue("b");
  expect(screen.getByRole("tab", { name: "Charts and quality" })).toBeVisible();
});
