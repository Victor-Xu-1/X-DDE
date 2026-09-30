import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { neighborhood, RelationshipGraph } from "./RelationshipGraph";
import type { ResearchGraph } from "./types";
const graph: ResearchGraph = {
  schema: 1,
  limit: 200,
  truncated: false,
  nodes: [
    { id: "asset:a", kind: "file", label: "model.pdb" },
    { id: "object:b", kind: "structure", label: "protein" },
    { id: "task:c", kind: "task", label: "design" },
    { id: "task:d", kind: "task", label: "unrelated" },
  ],
  edges: [
    { source: "asset:a", target: "object:b", relation: "represented_by" },
    { source: "object:b", target: "task:c", relation: "used_as_input" },
  ],
};
it("shows real immediate dependencies and supports keyboard asset selection", () => {
  expect(neighborhood(graph, "object:b").map((n) => n.id)).toEqual([
    "asset:a",
    "object:b",
    "task:c",
  ]);
  const onSelect = vi.fn();
  render(
    <RelationshipGraph
      graph={graph}
      selected="object:b"
      language="zh"
      onSelect={onSelect}
    />,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "任务: design" }), {
    key: "Enter",
  });
  expect(onSelect).toHaveBeenCalledWith("task:c");
  expect(screen.queryByRole("button", { name: "任务: unrelated" })).toBeNull();
});
