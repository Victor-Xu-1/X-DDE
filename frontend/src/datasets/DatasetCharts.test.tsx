import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DatasetCharts } from "./DatasetCharts";
import type { DatasetResult } from "./types";
import type { Job } from "../types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const job = (id: string) => ({ id }) as Job;
const result = (role = "independent_holdout_evaluation") =>
  ({
    operation: "del_model",
    program: "deli",
    version: "1",
    schema_version: 1,
    complete: true,
    request_sha256: "c".repeat(64),
    data_kind: "model",
    candidates: [],
    metadata: {},
    warnings: [],
    molecule_artifact: null,
    scope: "computed_data_not_experimental_affinity",
    artifacts: [
      {
        name: "data.json",
        role,
        format: "json",
        sha256: "a".repeat(64),
        size: 100,
      },
    ],
    counts: { training: 775, heldout: 225 },
    metrics: {},
  }) as DatasetResult;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    title,
    data,
  }: {
    title: string;
    data: { y?: unknown[] }[];
  }) => (
    <div role="application" aria-label={title}>
      {data
        .flatMap((trace) => trace.y ?? [])
        .filter((value) => typeof value === "string")
        .map((value) => (
          <span key={String(value)}>{String(value)}</span>
        ))}
    </div>
  ),
}));

it("shows loading and retry instead of metadata plots or internal errors", async () => {
  let settle!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    )
    .mockResolvedValueOnce(
      json({ heldout_predictions: [{ observed: 1.2, predicted: 0.8 }] }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<DatasetCharts job={job("study")} result={result()} language="en" />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading charts");
  expect(screen.queryByText("Calculation overview")).toBeNull();
  await act(async () =>
    settle(new Response("Traceback private paths", { status: 500 })),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "original research results remain downloadable",
  );
  expect(screen.queryByText(/Traceback|private paths/)).toBeNull();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("application", {
      name: "Independent holdout · observed vs predicted enrichment",
    }),
  ).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("rejects incomplete native chart documents instead of drawing zero or placeholder data", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(json({ heldout_predictions: [{ predicted: 0.8 }] })),
  );
  render(<DatasetCharts job={job("study")} result={result()} language="zh" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "图表暂时无法读取",
  );
  expect(screen.queryByRole("application")).toBeNull();
});

it("never retains a previous study's chart after switching native sources", async () => {
  let settle!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    )
    .mockResolvedValueOnce(json({ cycles: [{ set: "NEW", members: 20 }] }));
  vi.stubGlobal("fetch", fetcher);
  const data = result("barcode_quality");
  const { rerender } = render(
    <DatasetCharts job={job("previous")} result={data} language="en" />,
  );
  const previousSignal = fetcher.mock.calls[0][1].signal;
  rerender(<DatasetCharts job={job("current")} result={data} language="en" />);
  expect(previousSignal.aborted).toBe(true);
  expect(await screen.findByText("NEW")).toBeVisible();
  rerender(
    <DatasetCharts
      job={job("current")}
      result={result("barcode_quality")}
      language="en"
    />,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () =>
    settle(json({ cycles: [{ set: "OLD", members: 500 }] })),
  );
  expect(screen.queryByText("OLD")).toBeNull();
  expect(screen.getByText("NEW")).toBeVisible();
});
