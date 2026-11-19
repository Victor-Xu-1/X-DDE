import { expect, it } from "vitest";
import { tools } from "../operations/catalog";
import { taskIdFromHash } from "../useWorkbench";
import { taskEntryHash, taskEntryRoute } from "./task-entry-route";
import { taskHistoryRoute } from "./task-history-route";
import { environmentHash, environmentTabFromHash } from "./environment-route";
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
it.each(["unknown", "__proto__", "https://example.com"])(
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
});

it("resolves the runtime capability and shared runtime links without opening a task", () => {
  expect(taskEntryHash("resources")).toBe("#view=deployment&tab=runtime");
  for (const hash of [environmentHash("runtime"), "#view=new&tool=resources"]) {
    expect(taskEntryRoute(hash)).toBeNull();
    expect(environmentTabFromHash(hash)).toBe("runtime");
    expect(taskIdFromHash(hash)).toBe("");
  }
  expect(environmentTabFromHash(environmentHash("components"))).toBe(
    "components",
  );
  expect(environmentTabFromHash("#view=deployment&tab=unknown")).toBe(
    "components",
  );
  expect(environmentTabFromHash(taskEntryHash("predict"))).toBeNull();
});
it.each([
  "#view=results&module=binding&q=STAT6",
  "#view=tasks&module=proximity",
  "#task=11111111-1111-4111-8111-111111111111",
])(
  "leaves the existing history or selected-result route to its own authority: %s",
  (hash) => expect(taskEntryRoute(hash)).toBeNull(),
);
