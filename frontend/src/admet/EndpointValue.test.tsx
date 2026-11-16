import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Endpoint } from "./types";
import { boundedScore, EndpointValue } from "./EndpointValue";

const endpoint: Endpoint = {
  id: "hERG",
  name: "hERG",
  category: "Toxicity",
  task_type: "classification",
  minimum: 0,
  maximum: 1,
  unit: "-",
  species: "human",
  source_url: "https://tdcommons.ai/",
  source_dataset_size: 100,
  reference_metrics: {},
};
it("uses only explicit native classification bounds and rejects invented or clipped scales", () => {
  expect(boundedScore(endpoint, 0)).toBe(0);
  expect(boundedScore(endpoint, 1)).toBe(1);
  expect(boundedScore(endpoint, 0.635428)).toBe(0.635428);
  for (const value of [undefined, NaN, Infinity, -0.1, 1.01])
    expect(boundedScore(endpoint, value)).toBeNull();
  expect(boundedScore({ ...endpoint, minimum: undefined }, 0.7)).toBeNull();
  expect(boundedScore({ ...endpoint, maximum: 2 }, 0.7)).toBeNull();
  expect(
    boundedScore({ ...endpoint, task_type: "regression" }, 0.7),
  ).toBeNull();
});
it("retains native value and units without presenting classification as a risk percentage", () => {
  const view = render(
    <EndpointValue endpoint={endpoint} value={0.635428} zh={false} />,
  );
  expect(screen.getByText("0.6354")).toHaveAttribute("title", "0.635428");
  expect(screen.getByText("Score 0–1")).toBeVisible();
  expect(view.container.querySelector(".admet-score-track")).toHaveAttribute(
    "data-score",
    "0.635428",
  );
  expect(view.container.textContent).not.toContain("%");
  view.rerender(
    <EndpointValue
      endpoint={{ ...endpoint, task_type: "regression", unit: "log(mol/L)" }}
      value={-3.11504}
      zh={false}
    />,
  );
  expect(view.container.querySelector(".admet-score-track")).toBeNull();
  expect(screen.getByText("log(mol/L)")).toBeVisible();
  view.rerender(<EndpointValue endpoint={endpoint} value={undefined} zh />);
  expect(screen.getByText("—")).toBeVisible();
  expect(view.container.querySelector(".admet-score-track")).toBeNull();
});
