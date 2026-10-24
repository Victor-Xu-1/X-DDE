import { expect, it } from "vitest";
import { tools } from "../operations/catalog";
import { taskIdFromHash } from "../useWorkbench";
import { taskEntryHash, taskEntryRoute } from "./task-entry-route";
import { taskHistoryRoute } from "./task-history-route";
const project = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
it.each(tools.filter((tool) => tool.id !== "resources"))(
  "restores the registered $id questionnaire and its project without a selected task",
  ({ id }) => {
    const route = taskEntryHash(id, project);
    expect(taskEntryRoute(route)).toEqual({
      tool: id,
      project: project.toLowerCase(),
    });
    expect(taskIdFromHash(route)).toBe("");
    expect(taskHistoryRoute(route)).toBeNull();
  },
);
it("does not restore an old selected task attached to an explicit new-task address", () => {
  const route =
    "#view=new&tool=deepternary.model&task=11111111-1111-4111-8111-111111111111";
  expect(taskEntryRoute(route)?.tool).toBe("deepternary.model");
  expect(taskIdFromHash(route)).toBe("");
});
it.each(["unknown", "resources", "__proto__", "https://example.com"])(
  "uses the catalogue for an unregistered new-task destination %s",
  (tool) =>
    expect(
      taskEntryRoute("#view=new&tool=" + encodeURIComponent(tool)),
    ).toEqual({ tool: null, project: null }),
);
it("retains the empty-task bookmark and rejects malformed project identifiers", () => {
  expect(taskEntryRoute("#task=")).toEqual({ tool: null, project: null });
  expect(
    taskEntryRoute("#view=new&tool=predict&project=bad")?.project,
  ).toBeNull();
  expect(taskEntryHash(null)).toBe("#view=new");
  expect(taskEntryHash("resources")).toBe("#view=new");
});
it.each([
  "#view=results&module=binding&q=STAT6",
  "#view=tasks&module=proximity",
  "#task=11111111-1111-4111-8111-111111111111",
])(
  "leaves the existing history or selected-result route to its own authority: %s",
  (hash) => expect(taskEntryRoute(hash)).toBeNull(),
);
