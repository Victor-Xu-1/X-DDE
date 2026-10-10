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
  expect(screen.getByRole("group")).toHaveAttribute("width", "930");
});

it("does not expand sparse relationships to fill an ultrawide screen", () => {
  const sparse = {
    ...graph,
    nodes: graph.nodes.slice(0, 2),
    edges: graph.edges.slice(0, 1),
  };
  render(
    <RelationshipGraph
      graph={sparse}
      selected="object:b"
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByRole("group")).toHaveAttribute("width", "620");
  expect(screen.getByRole("group")).toHaveAttribute("height", "114");
  expect(screen.getByRole("group")).toHaveAttribute("viewBox", "0 0 620 114");
});

it("names scientific collections and their source relationships in both languages", () => {
  const collections: ResearchGraph = {
    schema: 1,
    limit: 200,
    truncated: false,
    nodes: [
      { id: "state_set:a", kind: "molecular_state_set", label: "states" },
      { id: "receptor_set:b", kind: "receptor_ensemble", label: "receptors" },
      { id: "site_set:c", kind: "binding_site_set", label: "sites" },
    ],
    edges: [
      {
        source: "receptor_set:b",
        target: "site_set:c",
        relation: "site_association",
      },
    ],
  };
  const { rerender } = render(
    <RelationshipGraph
      graph={collections}
      selected={null}
      language="zh"
      onSelect={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "分子状态集合: states" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "受体构象集合: receptors" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "跨构象位点: sites" }),
  ).toBeVisible();
  expect(screen.getByText("关联位点")).toBeInTheDocument();
  rerender(
    <RelationshipGraph
      graph={collections}
      selected={null}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Cross-conformation sites: sites" }),
  ).toBeVisible();
});
