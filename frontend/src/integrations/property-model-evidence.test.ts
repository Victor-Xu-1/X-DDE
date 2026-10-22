import { expect, it } from "vitest";
import type { NativeMetric } from "./types";
import { propertyModelEvidence } from "./property-model-evidence";

const metric = (name: string, value: number): NativeMetric => ({
  name,
  value,
  unit: "pKd",
  method: "Controlled evidence fixture",
  meaning: "validation",
});

it.each([-0.1937478415, 0])(
  "keeps insufficient reported R² %s explicit",
  (value) => {
    const data = propertyModelEvidence([metric("Test R²", value)]);
    expect(data.status).toBe("insufficient");
    expect(data.r2?.value).toBe(value);
  },
);

it("reports a positive held-out result without promoting it to validated applicability", () => {
  expect(propertyModelEvidence([metric("Test R²", 0.85)]).status).toBe(
    "reported",
  );
});

it("never substitutes missing, nonfinite or nonvalidation scores for evidence", () => {
  const data = propertyModelEvidence([
    metric("Test RMSE", Number.NaN),
    { ...metric("Test R²", 0.9), meaning: "score" },
  ]);
  expect(data).toEqual({
    status: "unassessed",
    r2: undefined,
    rmse: undefined,
  });
});
