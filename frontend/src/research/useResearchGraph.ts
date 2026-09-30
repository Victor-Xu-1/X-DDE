import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { GraphNode, ResearchGraph, ScientificObject } from "./types";

interface OutputIndex {
  job_id: string;
  state: string;
  errors: { artifact: string; reason: string }[];
}

export function useResearchGraph() {
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState<OutputIndex[]>([]);
  const [olderOffset, setOlderOffset] = useState(0),
    [hasOlder, setHasOlder] = useState(true);
  const revision = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++revision.current;
    setError("");
    try {
      const [value, index] = await Promise.all([
        request<ResearchGraph>("/research/graph", { signal }),
        request<OutputIndex[]>("/research/indexing", { signal }),
      ]);
      if (!signal?.aborted && ticket === revision.current) {
        setGraph(value);
        setIndexing(index);
        setOlderOffset(0);
        setHasOlder(true);
      }
    } catch (e) {
      if (!signal?.aborted && ticket === revision.current) setError(String(e));
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function older() {
    const objects = await request<ScientificObject[]>(
      `/research/objects?limit=100&offset=${olderOffset}`,
    );
    setOlderOffset((value) => value + objects.length);
    setHasOlder(objects.length === 100);
    setGraph(
      (current) =>
        current && {
          ...current,
          nodes: [
            ...new Map(
              [
                ...current.nodes,
                ...objects.map(
                  (object) =>
                    ({
                      id: "object:" + object.id,
                      kind: object.kind,
                      label: object.label,
                      object,
                    }) satisfies GraphNode,
                ),
              ].map((node) => [node.id, node]),
            ).values(),
          ],
        },
    );
  }
  async function select(id: string) {
    setSelected(id);
    try {
      const focused = await request<ResearchGraph>(
        `/research/graph?focus=${encodeURIComponent(id)}`,
      );
      setGraph(
        (current) =>
          current && {
            ...current,
            nodes: [
              ...new Map(
                [...current.nodes, ...focused.nodes].map((node) => [
                  node.id,
                  node,
                ]),
              ).values(),
            ],
            edges: [
              ...new Map(
                [...current.edges, ...focused.edges].map((edge) => [
                  JSON.stringify(edge),
                  edge,
                ]),
              ).values(),
            ],
          },
      );
    } catch (e) {
      setError(String(e));
    }
  }
  return {
    graph,
    selected,
    setSelected,
    error,
    setError,
    indexing,
    hasOlder,
    load,
    older,
    select,
  };
}
