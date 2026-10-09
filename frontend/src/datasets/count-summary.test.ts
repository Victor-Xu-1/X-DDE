import { expect, it } from "vitest";
import { countSummary } from "./count-summary";
import type { DatasetResult } from "./types";
it("uses only the native scientific counting summary and preserves unreported UMIs", () => {
  const result = {
    operation: "del_count",
    program: "deli",
    data_kind: "counts",
    counts: { samples: 2, counted_reads: 30 },
    metadata: {
      sample_totals: {
        A: { raw: 10, unique_umi: 4, corrected_umi: 3 },
        B: { raw: 20, unique_umi: null, corrected_umi: null },
      },
    },
  } as unknown as DatasetResult;
  expect(countSummary(result)).toEqual([
    { sample: "A", raw: 10, unique: 4, corrected: 3 },
    { sample: "B", raw: 20, unique: null, corrected: null },
  ]);
  expect(
    countSummary({ ...result, counts: { samples: 2, counted_reads: 31 } }),
  ).toBeNull();
  expect(countSummary({ ...result, program: "other" })).toBeNull();
});
