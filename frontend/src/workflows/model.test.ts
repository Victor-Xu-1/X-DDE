import { expect, it } from "vitest";
import type { Job } from "../types";
import { hasExternalCalls, planFromJobs } from "./model";
const jobs = [
  {
    id: "first",
    request: { operation: "properties", name: "first", smiles: ["CCO"] },
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
