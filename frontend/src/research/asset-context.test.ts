import { expect, it } from "vitest";
import { assetContext } from "./asset-context";
import type { GraphNode, ScientificObject } from "./types";

it("distinguishes identically named files using record, task and creation time", () => {
  const object = {
    kind: "molecule",
    source_job: "min-job",
    created_at: "2026-10-09T10:20:30Z",
    reference: { record: 1 },
  } as ScientificObject;
  const node: GraphNode = {
    id: "a",
    kind: "molecule",
    label: "minimized.sdf",
    object,
  };
  const nodes: GraphNode[] = [
    node,
    {
      id: "b",
      kind: "task",
      label: "STAT6 conformer study",
      job_id: "min-job",
    },
  ];
  expect(assetContext(node, nodes, "en")).toContain(
    "STAT6 conformer study · Record 2",
  );
  expect(assetContext(node, nodes, "zh")).toContain("记录 2");
  expect(node.label).toBe("minimized.sdf");
  expect(object.created_at).toBe("2026-10-09T10:20:30Z");
});

it("does not expose raw identifiers or invalid timestamps as filename context", () => {
  const node = {
    label: "original.sdf",
    object: {
      kind: "molecule",
      source_job: "private-id",
      created_at: "invalid",
      reference: { record: 0 },
    },
  } as GraphNode;
  expect(assetContext(node, [], "en")).toBe("Record 1");
  expect(
    assetContext({ id: "file", kind: "file", label: "original.sdf" }, [], "en"),
  ).toBe("");
});
