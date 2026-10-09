import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchTable } from "./ResearchTable";
import { csvCell, compareValues } from "./table-model";
import { ResearchTabs } from "./ResearchTabs";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllTimers();
});
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
it("selects a whole row by pointer or keyboard without stealing comparison and nested actions", async () => {
  const user = userEvent.setup(),
    onSelect = vi.fn(),
    action = vi.fn();
  render(
    <ResearchTable
      rows={rows}
      rowId={(row) => row.id}
      language="en"
      title="Row interactions"
      selected="record-7"
      onSelect={onSelect}
      columns={[
        ...columns,
        {
          key: "action",
          label: "Action",
          value: () => null,
          render: () => (
            <button type="button" onClick={action}>
              Inspect source
            </button>
          ),
        },
      ]}
    />,
  );
  const table = screen.getByRole("table", { name: "Row interactions" });
  const row = within(table).getByRole("row", { name: /JQ1/ });
  await user.click(within(row).getByRole("cell", { name: "2" }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(rows[1]);
  onSelect.mockClear();
  row.focus();
  await user.keyboard("{Enter} ");
  expect(onSelect).toHaveBeenCalledTimes(2);
  onSelect.mockClear();
  await user.click(
    within(row).getByRole("button", { name: "JQ1" }),
  );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(rows[1]);
  onSelect.mockClear();
  await user.click(within(row).getByRole("checkbox", { name: "Compare JQ1" }));
  await user.click(within(row).getByRole("button", { name: "Inspect source" }));
  expect(action).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
  expect(within(table).getByRole("row", { name: /Sotorasib/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
it("preserves disabled record restrictions and leaves a read-only report non-selectable", async () => {
  const user = userEvent.setup(),
    onSelect = vi.fn();
  const { rerender } = render(
    <ResearchTable
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      title="Restricted rows"
      language="en"
      onSelect={onSelect}
      canSelect={(row) => row.value !== null}
    />,
  );
  const row = screen.getByRole("row", { name: /Osimertinib/ });
  expect(row).not.toHaveAttribute("tabindex");
  expect(
    within(row).getByRole("button", { name: "Osimertinib" }),
  ).toBeDisabled();
  await user.click(row);
  expect(onSelect).not.toHaveBeenCalled();
  rerender(
    <ResearchTable
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      title="Restricted rows"
      language="en"
    />,
  );
  expect(screen.getByRole("row", { name: /JQ1/ })).not.toHaveAttribute(
    "tabindex",
  );
  expect(screen.getByRole("row", { name: /JQ1/ })).not.toHaveAttribute(
    "aria-selected",
  );
});
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
it("chooses visible metrics while retaining hidden search values and record identity", async () => {
  const user = userEvent.setup(),
    onSelect = vi.fn();
  const fields = [
    ...columns,
    {
      key: "source",
      label: "Original source",
      value: (row: (typeof rows)[number]) => row.id,
    },
    { key: "missing", label: "Unreported", value: () => null },
  ];
  render(
    <ResearchTable
      rows={rows}
      columns={fields}
      initialVisibleColumns={["name", "value"]}
      rowId={(row) => row.id}
      language="en"
      title="Selectable metrics"
      onSelect={onSelect}
    />,
  );
  const table = screen.getByRole("table", { name: "Selectable metrics" });
  expect(
    within(table).queryByRole("columnheader", { name: /Original source/ }),
  ).toBeNull();
  await user.type(screen.getByRole("searchbox"), "record-2");
  await user.click(within(table).getByRole("button", { name: "JQ1" }));
  expect(onSelect).toHaveBeenLastCalledWith(rows[1]);
  await user.click(screen.getByText("Columns", { selector: "summary" }));
  expect(screen.getByRole("checkbox", { name: "Molecule" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Original source" }));
  expect(
    within(table).getByRole("columnheader", { name: /Original source/ }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Core metrics" }));
  expect(
    within(table).queryByRole("columnheader", { name: /Original source/ }),
  ).toBeNull();
  expect(rows.map((row) => row.id)).toEqual([
    "record-7",
    "record-2",
    "record-9",
  ]);
});
it("downloads complete original metrics even when columns are hidden", async () => {
  const user = userEvent.setup();
  let captured: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      captured = blob;
      return "blob:table-export";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <ResearchTable
      rows={rows}
      columns={[
        ...columns,
        { key: "source", label: "Original source", value: (row) => row.id },
        { key: "missing", label: "Unreported", value: () => null },
      ]}
      initialVisibleColumns={["name", "value"]}
      rowId={(row) => row.id}
      language="en"
      title="Complete export"
    />,
  );
  await user.type(screen.getByRole("searchbox"), "sotor");
  await user.click(
    screen.getByRole("button", { name: "Export filtered rows" }),
  );
  expect(captured).toBeDefined();
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(captured!);
  });
  expect(text).toContain('"Original source"');
  expect(text).toContain('"record-7"');
  expect(text).not.toContain('"record-2"');
  expect(text).toContain('"Unreported"');
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
