import type { ResearchGraph } from "./types";

export function mergeResearchGraph(
  base: ResearchGraph,
  extra: ResearchGraph,
): ResearchGraph {
  return {
    ...base,
    nodes: [
      ...new Map(
        [...base.nodes, ...extra.nodes].map((node) => [node.id, node]),
      ).values(),
    ],
    edges: [
      ...new Map(
        [...base.edges, ...extra.edges].map((edge) => [
          JSON.stringify(edge),
          edge,
        ]),
      ).values(),
    ],
  };
}

export function checkedGraph(value: ResearchGraph) {
  if (
    value?.schema !== 1 ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  )
    throw new Error("Invalid research relationships");
  return value;
}
