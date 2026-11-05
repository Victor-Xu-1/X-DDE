import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
});

it.each([
  ["UTC", "", "9999-12-31", true, {}],
  [
    "Asia/Shanghai",
    "",
    "9999-12-31",
    false,
    { created_before: "9999-12-31T16:00:00.000Z" },
  ],
  [
    "America/Sao_Paulo",
    "2018-11-04",
    "2018-11-04",
    false,
    {
      created_from: "2018-11-04T03:00:00.000Z",
      created_before: "2018-11-05T02:00:00.000Z",
    },
  ],
  [
    "America/New_York",
    "2026-03-08",
    "2026-03-08",
    false,
    {
      created_from: "2026-03-08T05:00:00.000Z",
      created_before: "2026-03-09T04:00:00.000Z",
    },
  ],
  [
    "America/New_York",
    "2026-11-01",
    "2026-11-01",
    false,
    {
      created_from: "2026-11-01T04:00:00.000Z",
      created_before: "2026-11-02T05:00:00.000Z",
    },
  ],
])(
  "preserves exact local-day bounds in an isolated %s timezone",
  (timezone, startDate, endDate, error, bounds) => {
    // A subprocess gives Date/Intl an explicit timezone, without altering other tests.
    const source = pathToFileURL(
      resolve("src/studio/task-history-dates.ts"),
    ).href;
    const code = [
      "import {historyDateError,historyDateParams} from " +
        JSON.stringify(source) +
        ";",
      "const filter=" + JSON.stringify({ startDate, endDate }) + ";",
      "console.log(JSON.stringify({error:historyDateError(filter),bounds:historyDateParams(filter)}));",
    ].join("\n");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", code],
      {
        env: { ...process.env, TZ: String(timezone) },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ error, bounds });
  },
);
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
