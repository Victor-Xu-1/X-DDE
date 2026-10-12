import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../api";
import type { GraphNode, ResearchGraph, ScientificObject } from "./types";
import { checkedGraph, mergeResearchGraph } from "./graph-merge";

interface OutputIndex {
  job_id: string;
  state: string;
  errors: { artifact: string; reason: string }[];
}

export function useResearchGraph() {
  const [graph, setGraph] = useState<ResearchGraph | null>(null);
  const [selected, updateSelected] = useState<string | null>(null);
  const selectionRevision = useRef(0);
  const mounted = useRef(true);
  const controllers = useRef<{
    load?: AbortController;
    focus?: AbortController;
    older?: AbortController;
  }>({});
  const selectedId = useRef<string | null>(null);
  function setSelected(id: string | null) {
    controllers.current.load?.abort();
    controllers.current.focus?.abort();
    selectedId.current = id;
    selectionRevision.current++;
    updateSelected(id);
  }
  function selectionIntent() {
    return selectionRevision.current;
  }
  function selectSaved(id: string, intent: number) {
    if (mounted.current && selectionRevision.current === intent)
      setSelected(id);
  }
  function retainSaved(value: ScientificObject) {
    if (!mounted.current) return;
    setGraph(
      (current) =>
        current &&
        mergeResearchGraph(current, {
          ...current,
          nodes: [
            {
              id: "object:" + value.id,
              kind: value.kind,
              label: value.label,
              object: value,
            },
          ],
          edges: value.parent_id
            ? [
                {
                  source: "object:" + value.parent_id,
                  target: "object:" + value.id,
                  relation: value.relation,
                },
              ]
            : [],
        }),
    );
  }
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState<OutputIndex[]>([]);
  const [olderOffset, setOlderOffset] = useState(0),
    [hasOlder, setHasOlder] = useState(true);
  const revision = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!mounted.current) return;
    const ticket = ++revision.current;
    Object.values(controllers.current).forEach((controller) =>
      controller.abort(),
    );
    const controller = new AbortController();
    controllers.current = { load: controller };
    const bounded = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
      ...(signal ? [signal] : []),
    ]);
    setError("");
    try {
      const [value, index] = await Promise.all([
        request<ResearchGraph>("/research/graph", { signal: bounded }),
        request<OutputIndex[]>("/research/indexing", { signal: bounded }),
      ]);
      bounded.throwIfAborted();
      checkedGraph(value);
      if (!Array.isArray(index))
        throw new Error("Invalid output registration status");
      let next = value;
      const focus = selectedId.current;
      if (focus) {
        next = mergeResearchGraph(
          value,
          checkedGraph(
            await request<ResearchGraph>(
              `/research/graph?focus=${encodeURIComponent(focus)}`,
              { signal: bounded },
            ),
          ),
        );
        bounded.throwIfAborted();
      }
      if (mounted.current && ticket === revision.current) {
        setGraph(next);
        setIndexing(index);
        setOlderOffset(0);
        setHasOlder(true);
      }
    } catch {
      if (
        !controller.signal.aborted &&
        mounted.current &&
        ticket === revision.current
      )
        setError("Research files could not be refreshed. Retry to reconnect.");
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
      Object.values(controllers.current).forEach((current) => current.abort());
    };
  }, [load]);

  async function older() {
    if (controllers.current.older && !controllers.current.older.signal.aborted)
      return;
    const controller = new AbortController();
    controllers.current.older = controller;
    const bounded = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    try {
      const objects = await request<ScientificObject[]>(
        `/research/objects?limit=100&offset=${olderOffset}`,
        { signal: bounded },
      );
      bounded.throwIfAborted();
      if (!Array.isArray(objects))
        throw new Error("Invalid saved material list");
      if (!mounted.current) return;
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
    } catch {
      if (!controller.signal.aborted && mounted.current)
        throw new Error(
          "Earlier research files could not be loaded. Retry this page.",
        );
    } finally {
      if (controllers.current.older === controller)
        controllers.current.older = undefined;
    }
  }
  async function select(id: string) {
    setSelected(id);
    const intent = selectionRevision.current;
    const controller = new AbortController();
    controllers.current.focus = controller;
    const bounded = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    setError("");
    try {
      const focused = await request<ResearchGraph>(
        `/research/graph?focus=${encodeURIComponent(id)}`,
        { signal: bounded },
      );
      bounded.throwIfAborted();
      checkedGraph(focused);
      if (!mounted.current || selectionRevision.current !== intent) return;
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
    } catch {
      if (
        !controller.signal.aborted &&
        mounted.current &&
        selectionRevision.current === intent
      )
        setError(
          "The selected material could not be refreshed. Retry to reconnect.",
        );
    }
  }
  return {
    graph,
    selected,
    setSelected,
    selectionIntent,
    selectSaved,
    retainSaved,
    error,
    setError,
    indexing,
    hasOlder,
    load,
    older,
    select,
  };
}
