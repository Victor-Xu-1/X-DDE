import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { EndpointTable } from "./EndpointTable";
import { brainEndpointIds } from "./BrainScope";
import type { AdmetResult, AdmetRow } from "./types";

// UI contract values only; sealed native outputs are checked by the browser gate.
const row = {
  record: 0,
  status: "predicted",
  predictions: Object.fromEntries(brainEndpointIds.map((id) => [id, 0.25])),
} as AdmetRow;
const result = {
  focus: "brain",
  options: { view: "all" },
  endpoints: [
    ...brainEndpointIds.map((id) => ({
      id,
      name: id,
      category: "Distribution",
      task_type: "classification",
      minimum: 0,
      maximum: 1,
      unit: "-",
      species: "human",
      source_url: "https://tdcommons.ai/",
      source_dataset_size: 1,
      reference_metrics: {},
    })),
    {
      id: "hERG",
      name: "hERG",
      category: "Toxicity",
      task_type: "classification",
      minimum: 0,
      maximum: 1,
      unit: "-",
      species: "human",
      source_url: "https://tdcommons.ai/",
      source_dataset_size: 1,
      reference_metrics: {},
    },
  ],
} as unknown as AdmetResult;
afterEach(cleanup);
it("starts with BBB and explicit ADME context, retaining every native endpoint", async () => {
  const user = userEvent.setup(),
    original = JSON.stringify(result);
  render(<EndpointTable result={result} row={row} language="en" />);
  const table = screen.getByRole("table", {
    name: "Selected molecule predictions",
  });
  expect(table.querySelectorAll("tbody tr")).toHaveLength(7);
  expect(table.querySelector("tbody tr")).toHaveAttribute(
    "data-endpoint-id",
    "BBB_Martins",
  );
  expect(
    screen.getByText(/not substrate status or efflux ratio/),
  ).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Result group" })).toHaveValue(
    "brain",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Result group" }),
    "all",
  );
  expect(table.querySelectorAll("tbody tr")).toHaveLength(8);
  expect(within(table).getByText("hERG")).toBeVisible();
  expect(JSON.stringify(result)).toBe(original);
});
