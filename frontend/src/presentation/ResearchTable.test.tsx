import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchTable } from "./ResearchTable";
import { csvCell, compareValues } from "./table-model";
import { ResearchTabs } from "./ResearchTabs";
afterEach(cleanup);
// Deliberate UI fixtures, not experimental or model results.
const rows = [
  { id: "record-7", name: "Sotorasib", value: 8 },
  { id: "record-2", name: "JQ1", value: 2 },
  { id: "record-9", name: "Osimertinib", value: null },
];
const columns = [
  {
    key: "name",
    label: "Molecule",
    value: (row: (typeof rows)[number]) => row.name,
  },
  {
    key: "value",
    label: "Score (native unit)",
    value: (row: (typeof rows)[number]) => row.value,
    numeric: true,
  },
];
it("keeps original record identities while searching and sorting missing values", async () => {
  const user = userEvent.setup(),
    onSelect = vi.fn();
  render(
    <ResearchTable
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      title="Candidates"
      language="en"
      onSelect={onSelect}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: /Score \(native unit\)/ }),
  );
  const table = screen.getByRole("table", { name: "Candidates" });
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("JQ1");
  await user.type(screen.getByRole("searchbox"), "sotor");
  await user.click(screen.getByRole("button", { name: /^Sotorasib$/ }));
  expect(onSelect).toHaveBeenLastCalledWith(rows[0]);
  expect(rows.map((row) => row.id)).toEqual([
    "record-7",
    "record-2",
    "record-9",
  ]);
});
it("compares original values and units without replacing or normalizing them", async () => {
  const user = userEvent.setup();
  render(
    <ResearchTable
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      title="Candidates"
      language="en"
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: "Compare Sotorasib" }));
  await user.click(screen.getByRole("checkbox", { name: "Compare JQ1" }));
  await user.click(screen.getByRole("button", { name: "Compare (2)" }));
  const comparison = screen.getByRole("region", { name: "Result comparison" });
  expect(comparison).toHaveTextContent("Score (native unit)");
  expect(comparison).toHaveTextContent("8");
  expect(comparison).toHaveTextContent("2");
  expect(compareValues(null, 1, "descending")).toBe(1);
});
it("retains numerical signs while blocking spreadsheet formula injection", () => {
  expect(csvCell(-10.25)).toBe('"-10.25"');
  expect(csvCell('=HYPERLINK("unexpected")')).toBe(
    '"\'=HYPERLINK(""unexpected"")"',
  );
  expect(csvCell("结构,原始")).toBe('"结构,原始"');
  expect(csvCell(NaN)).toBe('""');
});
it("provides keyboard tab navigation and mounts only requested result views", async () => {
  const user = userEvent.setup(),
    mounted = vi.fn();
  function Detail() {
    mounted();
    return <p>Actual second view</p>;
  }
  render(
    <ResearchTabs
      label="Result views"
      tabs={[
        {
          id: "one",
          label: "Overview",
          content: <input aria-label="View state" />,
        },
        { id: "two", label: "Details", content: <Detail /> },
      ]}
    />,
  );
  expect(mounted).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("View state"), "retain");
  screen.getByRole("tab", { name: "Overview" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("Actual second view")).toBeVisible();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByLabelText("View state")).toHaveValue("retain");
});
