import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { ResearchGraph } from "./types";
import { useResearchGraph } from "./useResearchGraph";

const graph = (status = "succeeded"): ResearchGraph => ({
  schema: 1,
  limit: 200,
  truncated: false,
  edges: [],
  nodes: [
    {
      id: "task:source",
      kind: "task",
      label: "Controlled task metadata",
      status,
    },
  ],
});
afterEach(() => vi.restoreAllMocks());

it("cancels old focus reads and never merges stale task state after a new selection", async () => {
  let finish!: (value: ResearchGraph) => void;
  const read = vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path === "/research/indexing") return [] as never;
    if (path.endsWith("object%3Aa"))
        return (await new Promise<ResearchGraph>((resolve) => {
        finish = resolve;
      })) as never;
    return graph() as never;
  });
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.select("object:a");
  });
  await waitFor(() => expect(finish).toBeDefined());
  await act(() => result.current.select("object:b"));
  await act(async () => {
    finish(graph("running"));
    await old;
  });
  expect(result.current.selected).toBe("object:b");
  expect(result.current.graph?.nodes[0].status).toBe("succeeded");
  const request = read.mock.calls.find(([path]) => path.endsWith("object%3Aa"));
  expect(request?.[1]?.signal?.aborted).toBe(true);
});

it("refreshes a selected older material even when it is outside the recent graph window", async () => {
  const old = {
    ...graph(),
    nodes: [
      {
        id: "object:older",
        kind: "structure" as const,
        label: "STAT6 reference · controlled metadata",
      },
    ],
  };
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path === "/research/indexing"
      ? ([] as never)
      : path.includes("focus=")
        ? (old as never)
        : (graph() as never),
  );
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  await act(() => result.current.select("object:older"));
  await act(() => result.current.load());
  expect(result.current.selected).toBe("object:older");
  expect(
    result.current.graph?.nodes.some((node) => node.id === "object:older"),
  ).toBe(true);
});

it("clearing selection prevents a late successful write from taking the view back", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path === "/research/indexing" ? ([] as never) : (graph() as never),
  );
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  await act(() => result.current.select("object:a"));
  const token = result.current.selectionIntent();
  act(() => result.current.setSelected(null));
  act(() => result.current.selectSaved("object:saved", token));
  expect(result.current.selected).toBeNull();
});
