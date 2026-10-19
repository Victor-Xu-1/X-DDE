/** Reviewed public DEL006 count scope; short position means are only a UI fixture. */
export const nativeQuality = {
  reads: 1000,
  decoded: 710,
  mean_quality: [31, 32, 33],
  failures: { FailedBuildingBlockCall: 267, FailedStaticAlignment: 23 },
  umi_integrity: {
    schema_version: 1 as const,
    scope: "within_sample_library_and_compound" as const,
    expected_lengths: { DEL006: 11 },
    reads_by_status: {
      complete: 709,
      truncated: 1,
      too_long: 0,
      ambiguous: 0,
      missing: 0,
      not_defined: 0,
    },
    records_by_status: {
      complete: 702,
      truncated: 1,
      too_long: 0,
      ambiguous: 0,
      missing: 0,
      not_defined: 0,
    },
  },
};
