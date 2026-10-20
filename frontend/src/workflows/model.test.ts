import { expect, it } from "vitest";
import type { Job } from "../types";
import { hasExternalCalls, planFromJobs } from "./model";
const jobs = [
  {
    id: "first",
    request: {
      operation: "diffsbdd",
      name: "first",
      payload: { mode: "generate" },
    },
  },
  {
    id: "second",
    request: { operation: "properties", name: "second", smiles: ["CCN"] },
  },
] as Job[];
it("copies exact task templates and declares linear dependencies and bounded attempts", () => {
  const plan = planFromJobs(
    "series",
    ["first", "second"],
    jobs,
    new Set([1]),
    4,
  );
  expect(plan.steps[1].depends_on).toEqual(["step_1"]);
  expect(plan.steps[1].bindings[0]).toMatchObject({
    target: "property_input",
    result_field: "molecule_artifact",
  });
  expect(plan.budget).toEqual({ max_jobs: 2, wall_seconds: 14400 });
  expect(plan.steps[0].request).not.toBe(jobs[0].request);
  expect(hasExternalCalls(plan)).toBe(false);
  expect(() =>
    planFromJobs("series", ["missing"], jobs, new Set(), 1),
  ).toThrow();
});

it("uses the actual docking output role and refuses descriptor-only predecessors", () => {
  const docking = {
    ...jobs[0],
    request: { ...jobs[0].request, operation: "docking", mode: "dock" },
  } as Job;
  const plan = planFromJobs(
    "handoff",
    ["first", "second"],
    [docking, jobs[1]],
    new Set([1]),
    1,
  );
  expect(plan.steps[1].bindings[0].result_field).toBe("pose_artifact");
  const descriptor = {
    ...jobs[0],
    request: { ...jobs[1].request, name: "No molecule output" },
  } as Job;
  expect(() =>
    planFromJobs(
      "invalid",
      ["first", "second"],
      [descriptor, jobs[1]],
      new Set([1]),
      1,
    ),
  ).toThrow("real molecular outputs");
});

it("gates properties on measured pose quality while passing the same docking producer", () => {
  const tasks = [
    {
      id: "dock",
      request: { operation: "docking", mode: "dock", name: "Dock" },
    },
    {
      id: "qc",
      request: {
        operation: "pose_quality",
        name: "Check",
        options: { profile: "dock" },
      },
    },
    { ...jobs[1], id: "props" },
  ] as Job[];
  const plan = planFromJobs(
    "Measured handoff",
    ["dock", "qc", "props"],
    tasks,
    new Set([1, 2]),
    1,
  );
  expect(plan.steps[1].bindings.map((b) => [b.target, b.result_field])).toEqual(
    [
      ["quality_molecule", "pose_artifact"],
      ["quality_protein", "receptor_artifact"],
    ],
  );
  expect(plan.steps[1].quality_gate?.required_checks).toContain(
    "minimum_distance_to_protein",
  );
  expect(plan.steps[2].depends_on).toEqual(["step_2", "step_1"]);
  expect(plan.steps[2].bindings[0].from_step).toBe("step_1");
  expect(() =>
    planFromJobs("Wrong producer", ["props", "qc"], tasks, new Set([1]), 1),
  ).toThrow("immediately after docking");
});
