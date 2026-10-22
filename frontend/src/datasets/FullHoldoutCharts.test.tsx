import { createHash, webcrypto } from "node:crypto";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DatasetCharts } from "./DatasetCharts";
import { holdoutPredictionPoints } from "./holdout-predictions";
import type { DatasetResult } from "./types";
import type { Job } from "../types";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    title,
    data,
  }: {
    title: string;
    data: { x?: number[] }[];
  }) => (
    <div
      role="application"
      aria-label={title}
      data-points={data[0].x?.length}
      data-last={data[0].x?.at(-1)}
    />
  ),
}));
const header =
  "member,heldout_cycle,observed_log1p_enrichment,predicted_log1p_enrichment\r\n";
const csv = (count: number, offset = 0) =>
  header +
  Array.from(
    { length: count },
    (_, i) => "member-" + i + ",BB1," + (i + offset) + "," + (i + 0.5) + "\r\n",
  ).join("");
const job = (id: string) => ({ id }) as Job;
function result(text: string, total: number): DatasetResult {
  const bytes = new TextEncoder().encode(text);
  return {
    operation: "del_model",
    program: "deli",
    version: "1",
    schema_version: 1,
    complete: true,
    request_sha256: "a".repeat(64),
    data_kind: "model",
    metadata: {},
    warnings: [],
    candidates: [],
    counts: { training: 100, heldout: total },
    metrics: { rmse_log1p_enrichment: 0.67, mean_baseline_rmse: 0.66 },
    scope: "computed_data_not_experimental_affinity",
    molecule_artifact: null,
    artifacts: [
      {
        name: "model-evaluation.json",
        role: "independent_holdout_evaluation",
        format: "json",
        sha256: "a".repeat(64),
        size: 100,
      },
      {
        name: "holdout-predictions.csv",
        role: "heldout_member_predictions",
        format: "csv",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
      },
    ],
  } as DatasetResult;
}
const document = (total: number) =>
  new Response(
    JSON.stringify({
      heldout_members: total,
      heldout_predictions: [{ observed: 0, predicted: 0.5 }],
    }),
  );

it("renders the complete native held-out CSV beyond the old1000-point preview, without recomputing metrics", async () => {
  const text = csv(1003),
    data = result(text, 1003);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(document(1003))
      .mockResolvedValueOnce(new Response(text)),
  );
  render(<DatasetCharts job={job("full")} result={data} language="en" />);
  const plot = await screen.findByRole("application", {
    name: "Independent holdout · observed vs predicted enrichment",
  });
  expect(plot).toHaveAttribute("data-points", "1003");
  expect(plot).toHaveAttribute("data-last", "1002");
  expect(screen.getByText("Showing all 1,003 held-out pairs.")).toBeVisible();
  expect(
    screen.getByText("Has not outperformed the simple baseline"),
  ).toBeVisible();
  expect(screen.getByText("0.670")).toBeVisible();
});

it("refuses changed or incomplete native bytes rather than quietly drawing the preview subset", async () => {
  const text = csv(3),
    data = result(text, 3);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(document(3))
      .mockResolvedValueOnce(new Response(text.replace("2.5", "8.5"))),
  );
  render(<DatasetCharts job={job("changed")} result={data} language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "original research results remain downloadable",
  );
  expect(screen.queryByRole("application")).toBeNull();
});

it("never lets a late complete CSV replace the current study after navigation", async () => {
  let settle!: (response: Response) => void;
  const old = csv(3),
    current = csv(2, 100);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(document(3))
    .mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    )
    .mockResolvedValueOnce(document(2))
    .mockResolvedValueOnce(new Response(current));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <DatasetCharts job={job("old")} result={result(old, 3)} language="en" />,
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const oldSignal = fetcher.mock.calls[1][1].signal;
  rerender(
    <DatasetCharts
      job={job("current")}
      result={result(current, 2)}
      language="en"
    />,
  );
  const plot = await screen.findByRole("application");
  expect(oldSignal.aborted).toBe(true);
  expect(plot).toHaveAttribute("data-last", "101");
  await act(async () => settle(new Response(old)));
  expect(screen.getByRole("application")).toHaveAttribute("data-points", "2");
  expect(screen.getByRole("application")).toHaveAttribute("data-last", "101");
});

it("parses quoted native identifiers but refuses count drift, duplicates, blanks and nonfinite values", () => {
  expect(
    holdoutPredictionPoints(header + '"member,one",BB1,1.25e0,.5\r\n', 1),
  ).toEqual([{ observed: 1.25, predicted: 0.5 }]);
  for (const text of [
    header + "one,BB1,,.5\n",
    header + "one,BB1,NaN,.5\n",
    header + "one,BB1,1,Infinity\n",
    header + '"unfinished,BB1,1,.5\n',
  ])
    expect(() => holdoutPredictionPoints(text, 1)).toThrow();
  expect(() =>
    holdoutPredictionPoints(header + "one,BB1,1,.5\none,BB1,2,.7\n", 2),
  ).toThrow();
  expect(() => holdoutPredictionPoints(csv(3), 2)).toThrow();
});
