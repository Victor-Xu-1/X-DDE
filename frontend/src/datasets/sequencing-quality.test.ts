import { expect, it } from "vitest";
import {
  positionCoverage,
  validSequencing,
  umiStateLabel,
} from "./sequencing-quality";
import { nativeQuality } from "./sequencing-quality.test-data";

it("preserves native UMI completeness without upgrading historical unknowns", () => {
  expect(validSequencing(nativeQuality)).toBe(true);
  expect(
    validSequencing({ reads: 1000, decoded: 710, mean_quality: [30] }),
  ).toBe(true);
  expect(umiStateLabel(null, false)).toBe("Not assessed");
  expect(umiStateLabel("truncated", true)).toBe("长度不足");
});

it("rejects false pass counts, nonfinite diagnostics and unreconciled read evidence", () => {
  for (const mutate of [
    (v: any) => {
      v.umi_integrity.reads_by_status.complete = 710;
    },
    (v: any) => {
      v.umi_integrity.records_by_status.truncated = 2;
    },
    (v: any) => {
      v.umi_integrity.expected_lengths.DEL006 = 0;
    },
    (v: any) => {
      v.failures.FailedStaticAlignment = 24;
    },
    (v: any) => {
      v.q30_fraction = NaN;
    },
    (v: any) => {
      v.lengths = [{ length: 3, reads: 999 }];
    },
    (v: any) => {
      v.bases = 100;
      v.lengths = [{ length: 3, reads: 1000 }];
    },
  ]) {
    const value = structuredClone(nativeQuality);
    mutate(value);
    expect(validSequencing(value)).toBe(false);
  }
});

it("uses exact length-histogram coverage and leaves unsupported historical coverage unknown", () => {
  const document = {
    reads: 3,
    decoded: 2,
    mean_quality: [30, 31, 32],
    lengths: [
      { length: 2, reads: 1 },
      { length: 3, reads: 2 },
    ],
    bases: 8,
  };
  expect(validSequencing(document)).toBe(true);
  expect(positionCoverage(document)).toEqual([3, 3, 2]);
  expect(positionCoverage({ ...document, lengths: undefined })).toBeUndefined();
  expect(
    positionCoverage({ ...document, lengths: [{ length: 6000, reads: 3 }] }),
  ).toBeUndefined();
});
