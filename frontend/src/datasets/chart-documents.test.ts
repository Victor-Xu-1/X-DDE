import { expect, it } from "vitest";
import { validateChartDocument } from "./chart-documents";

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
