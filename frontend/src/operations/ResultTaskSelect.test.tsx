import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import type {
  TaskHistoryItem,
  TaskHistoryPage,
} from "../studio/task-history-model";
import { ResultTaskSelect } from "./ResultTaskSelect";

afterEach(cleanup);
const selected = {
  job: {
    id: "linked",
    request: { name: "Public native transport-engine" },
    created_at: "2026-10-11T00:00:00Z",
  },
  capability_id: "properties",
  example_cases: [
    { id: "confirmed", label: ["确认的研究案例", "Confirmed research case"] },
  ],
} as TaskHistoryItem;
const empty: TaskHistoryPage = {
  items: [],
  counts: {},
  total: 0,
  offset: 0,
  limit: 20,
};
it("retains the same linked identity outside a page and renders its localized case instead of engineering names", async () => {
  const change = vi.fn();
  const { rerender } = render(
    <ResultTaskSelect
      language="en"
      scope="examples"
      selected={selected}
      data={empty}
      loading={false}
      page={0}
      onPage={vi.fn()}
      onSelect={change}
    />,
  );
  expect(
    screen.getByRole("option", {
      name: "Current selection: Confirmed research case",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveValue("linked");
  expect(screen.queryByText(/Public native/)).toBeNull();
  rerender(
    <ResultTaskSelect
      language="zh"
      scope="examples"
      selected={selected}
      data={empty}
      loading={false}
      page={0}
      onPage={vi.fn()}
      onSelect={change}
    />,
  );
  expect(
    screen.getByRole("option", { name: "当前选择：确认的研究案例" }),
  ).toBeInTheDocument();
  await userEvent.setup().selectOptions(screen.getByRole("combobox"), "linked");
  expect(change).toHaveBeenCalledExactlyOnceWith(selected);
});
