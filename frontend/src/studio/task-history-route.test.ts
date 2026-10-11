import { expect, it } from "vitest";
import { taskHistoryHash, taskHistoryRoute } from "./task-history-route";
it("round trips a module, exact task type, status, query, page and project without requiring a selected task", () => {
  const filter = {
    module: "evaluation" as const,
    type: "properties",
    status: "succeeded" as const,
    query: "STAT6 %_ series",
    page: 3,
    project: "00000000-0000-0000-0000-000000000007",
  };
  expect(taskHistoryRoute(taskHistoryHash(filter))).toEqual(filter);
});
it("rejects invalid or cross-module filters and preserves the module overview", () => {
  expect(
    taskHistoryRoute(
      "#view=tasks&module=binding&type=properties&status=unknown&page=-1&project=bad",
    ),
  ).toEqual({
    module: "binding",
    type: "all",
    status: "all",
    query: "",
    page: 0,
    project: null,
  });
  expect(
    taskHistoryRoute("#view=tasks&module=unknown&type=predict&page=Infinity")
      ?.module,
  ).toBeNull();
  expect(taskHistoryRoute("#task=")).toBeNull();
});
