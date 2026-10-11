import { expect, it } from "vitest";
import type { TaskHistoryItem } from "../studio/task-history-model";
import { resultSourceLabel, resultSourceTitle } from "./result-source-labels";

const source = {
  job: {
    id: "source",
    created_at: "2026-10-11T00:00:00Z",
    request: {
      operation: "properties",
      name: "Public native transport-engine",
    },
  },
  capability_id: "properties",
  example_cases: [
    {
      id: "confirmed-case",
      label: ["确认的研究案例", "Confirmed research case"],
    },
  ],
} as TaskHistoryItem;

it("uses only linked scientific case metadata for fixed examples in both languages", () => {
  expect(resultSourceTitle(source, "examples", "en")).toBe(
    "Confirmed research case",
  );
  expect(resultSourceTitle(source, "examples", "zh")).toBe("确认的研究案例");
  const label = resultSourceLabel(source, "examples", "en", 20, false);
  expect(label).toContain("Confirmed research case");
  expect(label).toContain("Calculate molecular properties");
  expect(label).toContain("#21");
  expect(label).not.toContain("transport-engine");
});
it("leaves personal scientific names verbatim, including when metadata also exists", () => {
  expect(resultSourceTitle(source, "research", "zh")).toBe(
    source.job.request.name,
  );
});
it("does not infer a target from an unlinked or misleading archived task title", () => {
  const unlinked = { ...source, example_cases: [] };
  expect(resultSourceTitle(unlinked, "examples", "en")).toBe(
    "Historical reference result",
  );
});
it("preserves multiple explicitly linked cases without asserting a different single target", () => {
  const multiple = {
    ...source,
    example_cases: [
      ...source.example_cases!,
      {
        id: "second",
        label: ["第二个案例", "Second case"] as [string, string],
      },
    ],
  };
  expect(resultSourceTitle(multiple, "examples", "en")).toBe(
    "Confirmed research case / Second case",
  );
});
