import type { GraphNode } from "./types";
export type AssetFilter =
  "research" | "molecule" | "structure" | "sequence" | "file" | "task" | "all";
export function visibleAssetNodes(
  nodes: GraphNode[],
  filter: AssetFilter,
  query: string,
) {
  return nodes.filter(
    (n) =>
      (filter === "all" ||
        (filter === "research"
          ? Boolean(n.object) ||
            [
              "pocket",
              "molecular_state_set",
              "receptor_ensemble",
              "binding_site_set",
              "pose_ensemble",
              "region",
            ].includes(n.kind)
          : n.kind === filter)) &&
      (n.label + " " + n.kind + " " + (n.operation ?? ""))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
}
