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

// The recent graph can contain a parent through a recent child's ancestry while
// omitting an older downstream version. Node presence is not a complete focus.
const recent = (): ResearchGraph => ({
  schema: 1,
  limit: 200,
  truncated: true,
  nodes: [
    { id: "object:source", kind: "sequence", label: "Original sequence" },
  ],
  edges: [],
});
const focused = (): ResearchGraph => ({
  ...recent(),
  nodes: [
    ...recent().nodes,
    { id: "object:earlier", kind: "sequence", label: "Earlier notes" },
  ],
  edges: [
    {
      source: "object:source",
      target: "object:earlier",
      relation: "edited_from",
    },
  ],
});
function recoveryRead() {
  return vi
    .spyOn(client, "request")
    .mockImplementation(
      async (path) =>
        (path === "/research/indexing"
          ? []
          : path.includes("focus=")
            ? focused()
            : recent()) as never,
    );
}
function expectRelationships(value: ResearchGraph | null) {
  expect(value?.nodes.some((node) => node.id === "object:earlier")).toBe(true);
  expect(value?.edges).toContainEqual(focused().edges[0]);
}
it("refreshes focused relationships even when the selected node is already recent", async () => {
  const read = recoveryRead();
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  await act(() => result.current.select("object:source"));
  expectRelationships(result.current.graph);
  await act(() => result.current.load());
  expectRelationships(result.current.graph);
  expect(result.current.selected).toBe("object:source");
  expect(
    read.mock.calls.filter(([path]) => path.includes("focus=")),
  ).toHaveLength(2);
});
it("retries a failed selection and preserves relationships while a later refresh fails", async () => {
  const read = recoveryRead();
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  read.mockRejectedValueOnce(new Error("Controlled focused read failure"));
  await act(() => result.current.select("object:source"));
  expect(result.current.error).toContain("selected material");
  await act(() => result.current.load());
  expect(result.current.error).toBe("");
  expectRelationships(result.current.graph);
  read.mockImplementation(async (path) => {
    if (path.includes("focus="))
      throw new Error("Controlled focus refresh failure");
    return (path === "/research/indexing" ? [] : recent()) as never;
  });
  await act(() => result.current.load());
  expect(result.current.error).toContain("could not be refreshed");
  expectRelationships(result.current.graph);
});
it.each(["clear", "select", "unmount"] as const)(
  "ignores a late focused refresh after %s",
  async (action) => {
    const read = recoveryRead();
    const { result, unmount } = renderHook(() => useResearchGraph());
    await waitFor(() => expect(result.current.graph).not.toBeNull());
    await act(() => result.current.select("object:source"));
    let finish!: (value: ResearchGraph) => void;
    let signal: AbortSignal | undefined;
    read.mockImplementation(async (path, init) => {
      if (path.endsWith("object%3Asource")) {
        signal = init?.signal as AbortSignal;
        return (await new Promise<ResearchGraph>((resolve) => {
          finish = resolve;
        })) as never;
      }
      return (path === "/research/indexing" ? [] : recent()) as never;
    });
    let work!: Promise<void>;
    await act(async () => {
      work = result.current.load();
    });
    await waitFor(() => expect(finish).toBeDefined());
    if (action === "unmount") unmount();
    else if (action === "clear") act(() => result.current.setSelected(null));
    else await act(() => result.current.select("object:newer"));
    const before = result.current.graph;
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish({
        ...focused(),
        nodes: [{ id: "object:stale", kind: "sequence", label: "Stale" }],
      });
      await work;
    });
    expect(result.current.graph).toBe(before);
    expect(result.current.error).toBe("");
    if (action !== "unmount")
      expect(result.current.selected).toBe(
        action === "clear" ? null : "object:newer",
      );
  },
);
it("keeps no-selection refresh independent of any focused read", async () => {
  const read = recoveryRead();
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  await act(() => result.current.load());
  expect(read.mock.calls.some(([path]) => path.includes("focus="))).toBe(false);
  expect(result.current.graph).toEqual(recent());
  expect(result.current.error).toBe("");
});
it("only publishes the newest overlapping refresh", async () => {
  const read = recoveryRead();
  const { result } = renderHook(() => useResearchGraph());
  await waitFor(() => expect(result.current.graph).not.toBeNull());
  await act(() => result.current.select("object:source"));
  let finish!: (value: ResearchGraph) => void;
  read.mockImplementationOnce(
    async () =>
      (await new Promise<ResearchGraph>((resolve) => {
        finish = resolve;
      })) as never,
  );
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.load();
  });
  await act(() => result.current.load());
  expectRelationships(result.current.graph);
  const current = result.current.graph;
  await act(async () => {
    finish({ ...recent(), nodes: [] });
    await old;
  });
  expect(result.current.graph).toBe(current);
});
