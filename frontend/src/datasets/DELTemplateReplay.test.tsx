import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DataExample } from "./useDatasetExample";
import { useDELForm } from "./useDELForm";

const state = vi.hoisted(() => ({
  example: null as DataExample | null,
  submit: vi.fn(),
}));
vi.mock("./useDatasetExample", () => ({
  useDatasetExample: () => state.example,
}));
vi.mock("./useDatasetRun", () => ({
  useDatasetRun: () => ({ submit: state.submit }),
}));
vi.mock("./useTablePreview", () => ({
  useTablePreview: () => ({ preview: null, error: "" }),
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true }),
}));
afterEach(() => {
  cleanup();
  state.example = null;
  state.submit.mockReset();
});

it("submits the actual selected template options, full-cohort denominator and matched comparison", async () => {
  const { result, rerender } = renderHook(() =>
    useDELForm({ tool: "del.analyze", language: "en", onCreated: vi.fn() }),
  );
  const asset = {
    id: "counts-fixture",
    name: "original.csv.gz",
    kind: "counts" as const,
    suffix: ".csv.gz",
    size: 100,
    sha256: "a".repeat(64),
    created_at: "2026-10-18T00:00:00Z",
  };
  state.example = {
    assets: new Map([[asset.id, asset]]),
    sources: [],
    task: {
      operation: "del_analyze",
      name: "Protocol fixture, not a scientific result",
      inputs: [
        {
          role: "counts",
          label: asset.name,
          source: {
            asset_id: asset.id,
            sha256: asset.sha256,
            record: 0,
            conformer: 0,
          },
        },
      ],
      sources: [],
      payload: {
        kind: "deli",
        mode: "analyze",
        library_size: 884736,
        max_members: 600000,
        count_unit: "reads",
        chosen_comparison: "second-eluate",
        cycle_columns: ["ID_A", "ID_B", "ID_C"],
        minimum_counts: 30,
        samples: [
          {
            column: "raw",
            group: "target",
            role: "target",
            replicate: 1,
            round: 1,
            batch: "e2",
          },
        ],
        comparisons: [
          { id: "second-eluate", selection: "target", reference: "matrix" },
        ],
      },
      options: { device: "cpu", cpu: 2, memory_mib: 2048, seed: 2026 },
      time_limit_seconds: 1800,
      output_bytes: 1024 ** 3,
    },
  };
  rerender();
  await waitFor(() => expect(result.current.asset?.id).toBe(asset.id));
  await act(async () => {
    await result.current.submit();
  });
  const sent = state.submit.mock.calls[0][0];
  expect(sent.options).toEqual(state.example.task.options);
  expect(sent.time_limit_seconds).toBe(1800);
  expect(sent.output_bytes).toBe(1024 ** 3);
  expect(sent.payload).toMatchObject({
    library_size: 884736,
    max_members: 600000,
    chosen_comparison: "second-eluate",
    minimum_counts: 30,
    count_unit: "reads",
  });
  act(() =>
    result.current.setAsset({ ...asset, id: "other", sha256: "b".repeat(64) }),
  );
  await act(async () => {
    await result.current.submit();
  });
  expect(state.submit.mock.calls[1][0].payload.library_size).toBeUndefined();
});
