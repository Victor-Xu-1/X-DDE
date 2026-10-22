export interface DesignNode {
  id: string;
  score: number | null;
  depth: number;
  y: number;
}
export interface DesignEdge {
  parent: string;
  child: string;
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Retain every supplied improving and declining path. Never infer a biological tree. */
export function designLineage(value: Record<string, unknown>) {
  const groups = [value.improving_lineages, value.declining_lineages];
  const paths = groups.flatMap((group) => (Array.isArray(group) ? group : []));
  const nodes = new Map<string, DesignNode>(),
    edges = new Map<string, DesignEdge>();
  const uniquePaths = new Set<string>();
  for (const path of paths) {
    if (
      !object(path) ||
      !Array.isArray(path.candidate_ids) ||
      !Array.isArray(path.scores) ||
      path.candidate_ids.length < 2 ||
      path.candidate_ids.length !== path.scores.length ||
      new Set(path.candidate_ids).size !== path.candidate_ids.length
    )
      throw new Error("Invalid native lineage path.");
    const ids = path.candidate_ids,
      scores = path.scores;
    uniquePaths.add(JSON.stringify(ids));
    for (let depth = 0; depth < ids.length; depth++) {
      const id = ids[depth],
        score = scores[depth];
      if (
        typeof id !== "string" ||
        !id.trim() ||
        id.length > 128 ||
        (score !== null &&
          (typeof score !== "number" || !Number.isFinite(score)))
      )
        throw new Error("Invalid native lineage identity or score.");
      const previous = nodes.get(id);
      if (previous && (previous.score !== score || previous.depth !== depth))
        throw new Error("Conflicting native lineage evidence.");
      nodes.set(id, { id, score, depth, y: 0 });
      if (nodes.size > 500)
        throw new Error(
          "The complete lineage exceeds the interactive view limit.",
        );
      if (depth) {
        const parent = ids[depth - 1] as string;
        edges.set(JSON.stringify([parent, id]), { parent, child: id });
      }
    }
  }
  const total = value.lineage_count;
  if (
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < uniquePaths.size
  )
    throw new Error("Native lineage count differs from its supplied paths.");
  const levels = new Map<number, DesignNode[]>();
  for (const node of nodes.values())
    levels.set(node.depth, [...(levels.get(node.depth) ?? []), node]);
  for (const level of levels.values())
    level
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((node, index) => {
        node.y = index - (level.length - 1) / 2;
      });
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    paths: uniquePaths.size,
    total,
  };
}
