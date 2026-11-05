import { expect, it } from "vitest";
import {
  calendarDay,
  dayLabel,
  historyDateError,
  historyDateParams,
} from "./task-history-dates";
import { historyUrl } from "./task-history-model";
import { taskHistoryHash, taskHistoryRoute } from "./task-history-route";

it("validates calendar dates, leap days and inclusive ranges without rollover", () => {
  expect(dayLabel(calendarDay("2024-02-29")!)).toBe("2024-02-29");
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-1-1",
    "bad",
    "0000-01-01",
  ])
    expect(calendarDay(value)).toBeNull();
  expect(
    historyDateError({ startDate: "2026-10-03", endDate: "2026-10-02" }),
  ).toBe(true);
  expect(
    historyDateError({ startDate: "2026-10-02", endDate: "2026-10-02" }),
  ).toBe(false);
  expect(historyDateError({ endDate: "9999-12-31" })).toBe(true);
  expect(historyDateParams({ endDate: "9999-12-31" })).toEqual({});
});
it("converts local calendar days to half-open instants and retains them in the module URL", () => {
  const filter = {
    module: "evaluation" as const,
    type: "properties",
    status: "all" as const,
    query: "STAT6",
    project: null,
    page: 3,
    startDate: "2026-10-02",
    endDate: "2026-10-02",
  };
  expect(taskHistoryRoute(taskHistoryHash(filter))).toEqual(filter);
  const params = new URLSearchParams(historyUrl(filter).split("?")[1]);
  expect(params.get("offset")).toBe("60");
  expect(params.get("created_from")).toBe(
    calendarDay("2026-10-02")!.toISOString(),
  );
  expect(params.get("created_before")).toBe(
    calendarDay("2026-10-03")!.toISOString(),
  );
  expect(historyDateParams({})).toEqual({});
  const invalid = taskHistoryRoute(
    "#view=results&module=evaluation&from=2026-02-31",
  );
  expect(historyDateError(invalid!)).toBe(true); // A bad URL is visible, never silently broadened.
});
