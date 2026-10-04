import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MetricScatter } from "./MetricScatter";
afterEach(cleanup);
it("plots only complete raw pairs and selects the exact original record", async () => {
  const rows = [
      { id: "source-8", mw: 400, score: -8.25 },
      { id: "source-3", mw: 500, score: -6.5 },
      { id: "source-1", mw: 600, score: null },
    ],
    onSelect = vi.fn();
  render(
    <MetricScatter
      rows={rows}
      label="Native scores"
      language="en"
      rowId={(row) => row.id}
      rowLabel={(row) => row.id}
      onSelect={onSelect}
      metrics={[
        { key: "mw", label: "MW (g/mol)", value: (row) => row.mw },
        { key: "score", label: "Score (kcal/mol)", value: (row) => row.score },
      ]}
    />,
  );
  const points = within(
    screen.getByRole("group", { name: "MW (g/mol) × Score (kcal/mol)" }),
  ).getAllByRole("button");
  expect(points).toHaveLength(2);
  await userEvent.setup().click(
    screen.getByRole("button", {
      name: "source-8: MW (g/mol) 400; Score (kcal/mol) -8.25",
    }),
  );
  expect(onSelect).toHaveBeenLastCalledWith(rows[0]);
});
