import { expect, it } from "vitest";
import type { ResearchGraph } from "../research/types";
import { researchGraphForDisplay } from "./research-graph";
it("hides internal file nodes while retaining scientific reuse links and the authoritative graph", () => {
  const graph: ResearchGraph = {
    schema: 1,
    limit: 200,
    truncated: false,
    nodes: [
      { id: "file:internal", kind: "file", label: "result.json" },
      { id: "analysis:internal", kind: "analysis", label: "result.json" },
      { id: "file:structure", kind: "file", label: "BRD4.pdb" },
      { id: "task:generate", kind: "task", label: "BRD4 pocket generation" },
      { id: "object:ligand", kind: "molecule", label: "JQ1 candidate" },
    ],
    edges: [
      {
        source: "task:generate",
        target: "file:internal",
        relation: "produced",
      },
      {
        source: "file:structure",
        target: "task:generate",
        relation: "used_as_input",
      },
      {
        source: "task:generate",
        target: "object:ligand",
        relation: "produced",
      },
    ],
  };
  const view = researchGraphForDisplay(graph);
  expect(view.nodes.map((n) => n.id)).not.toContain("file:internal");
  expect(view.edges).toEqual(graph.edges.slice(1));
  expect(graph.nodes).toHaveLength(5);
  expect(view.nodes.map((n) => n.id)).not.toContain("analysis:internal");
  expect(graph.edges).toHaveLength(3);
});
