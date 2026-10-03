import { expect, it } from "vitest";
import { visibleAssetNodes } from "./asset-list";
import type { GraphNode } from "./types";
it("keeps originals and tasks available explicitly without crowding the default research list", () => {
  const nodes = [
    { id: "file", kind: "file", label: "Imatinib.sdf" },
    {
      id: "object",
      kind: "molecule",
      label: "Imatinib",
      object: { id: "exact-version" },
    },
    { id: "task", kind: "task", label: "ABL properties" },
  ] as GraphNode[];
  expect(visibleAssetNodes(nodes, "research", "").map((n) => n.id)).toEqual([
    "object",
  ]);
  expect(visibleAssetNodes(nodes, "file", "").map((n) => n.id)).toEqual([
    "file",
  ]);
  expect(visibleAssetNodes(nodes, "all", "ABL").map((n) => n.id)).toEqual([
    "task",
  ]);
  expect(nodes).toHaveLength(3);
});
