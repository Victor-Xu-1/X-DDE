import type { ResearchGraph } from "../research/types";
import { isResearchFile } from "./research-files";
/** Filter the display only; the server graph and all original assets stay intact. */
export function researchGraphForDisplay(graph: ResearchGraph): ResearchGraph {
  const nodes = graph.nodes.filter((node) => {
    if (node.kind === "file") return isResearchFile(node.label);
    if (
      node.kind === "analysis" &&
      /\.(json|log|ya?ml|toml)$/i.test(node.label)
    )
      return false;
    return true;
  });
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}
