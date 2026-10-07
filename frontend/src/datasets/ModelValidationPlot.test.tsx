import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ModelValidationPlot } from "./ModelValidationPlot";

afterEach(cleanup);
const points = [{ observed: 0.8, predicted: 0.6 }];
it("compares native held-out error with the baseline without declaring model acceptance", () => {
  const { rerender } = render(
    <ModelValidationPlot
      points={points}
      metrics={{ rmse_log1p_enrichment: 0.577, mean_baseline_rmse: 0.565 }}
      language="zh"
    />,
  );
  expect(screen.getByText("尚未优于简单基线")).toBeVisible();
  expect(screen.getByText("0.577")).toBeVisible();
  rerender(
    <ModelValidationPlot
      points={points}
      metrics={{ rmse_log1p_enrichment: 0.4, mean_baseline_rmse: 0.565 }}
      language="zh"
    />,
  );
  expect(screen.getByText("留出误差低于简单基线")).toBeVisible();
});

it("never labels application predictions or missing comparisons as independent validation", () => {
  const { rerender } = render(
    <ModelValidationPlot points={points} metrics={{}} language="en" />,
  );
  expect(
    screen.queryByText(/outperformed|below the simple baseline/),
  ).toBeNull();
  rerender(
    <ModelValidationPlot
      points={points}
      metrics={{ rmse_log1p_enrichment: 0.4, mean_baseline_rmse: 0.565 }}
      language="en"
      application
    />,
  );
  expect(
    screen.getByText("Model application · not independent validation"),
  ).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Independent validation metrics" }),
  ).toBeNull();
});
