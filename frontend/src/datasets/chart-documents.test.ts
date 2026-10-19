import { expect, it } from "vitest";
import { validateChartDocument } from "./chart-documents";
import { barcodeQualityCsv } from "./barcode-quality";

it("preserves native missing-correlation masks and refuses mismatched axes", () => {
  const data = {
    samples: [{ column: "target-1", depth: 320 }],
    correlation_logcpm_pearson: [[0]],
    correlation_available: [[false]],
  };
  expect(validateChartDocument("count_quality", data)).toBe(data);
  expect(() =>
    validateChartDocument("count_quality", {
      ...data,
      correlation_available: [],
    }),
  ).toThrow();
});
it("refuses nonfinite model values and impossible decoding counts without silently substituting zeros", () => {
  expect(() =>
    validateChartDocument("independent_holdout_evaluation", {
      heldout_predictions: [{ observed: 1, predicted: NaN }],
    }),
  ).toThrow();
  expect(() =>
    validateChartDocument("sequencing_quality", {
      reads: 10,
      decoded: 11,
      mean_quality: [32],
    }),
  ).toThrow();
});

it("retains partial historical barcode evidence but rejects impossible counts and correction claims", () => {
  const row = {
    set: "DEL006_BBA",
    members: 96,
    barcodes: 96,
    valid_structures: 96,
    minimum_observed_hamming_distance: 4,
    pair_checks: 4560,
    complete_pair_review: true,
    one_error_correction_uniquely_supported: true,
  };
  const complete = { cycles: [row] };
  expect(validateChartDocument("barcode_quality", complete)).toBe(complete);
  const legacy = { cycles: [{ set: "OLD", members: 96 }] };
  expect(validateChartDocument("barcode_quality", legacy)).toBe(legacy);
  for (const patch of [
    { valid_structures: 97 },
    { barcodes: 97 },
    { pair_checks: 4561 },
    { pair_checks: 100 },
    { minimum_observed_hamming_distance: 2 },
    { minimum_observed_hamming_distance: null },
    { pair_checks: NaN },
    { barcodes: null },
    { complete_pair_review: false },
    { one_error_correction_uniquely_supported: "true" },
  ])
    expect(() =>
      validateChartDocument("barcode_quality", {
        cycles: [{ ...row, ...patch }],
      }),
    ).toThrow();
  expect(() =>
    validateChartDocument("barcode_quality", { cycles: [row, row] }),
  ).toThrow();
});

it("exports original barcode scalars and empty missing evidence without CSV formula execution", () => {
  const csv = barcodeQualityCsv("native-job", [
    {
      set: "=not-a-formula",
      members: 96,
      barcodes: 96,
      valid_structures: 95,
      minimum_observed_hamming_distance: 2,
      pair_checks: 4560,
      complete_pair_review: true,
      one_error_correction_uniquely_supported: false,
    },
    { set: "legacy", members: 20 },
  ]);
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  expect(lines[0]).toContain('"dataset_job","set","members","barcodes"');
  expect(lines[1]).toBe(
    '"native-job","\'=not-a-formula","96","96","95","2","4560","true","false"',
  );
  expect(lines[2]).toBe('"native-job","legacy","20","","","","","",""');
});
