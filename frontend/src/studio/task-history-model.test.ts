import { expect, it } from "vitest";
import type { Job } from "../types";
import {
  historyUrl,
  kindForJob,
  moduleForKind,
  kindsForModule,
  moduleCounts,
} from "./task-history-model";

it.each([
  [{}, "predict", "structures"],
  [
    { operation: "diffsbdd", payload: { mode: "generate" } },
    "diffsbdd.generate",
    "molecules",
  ],
  [
    { operation: "diffsbdd", payload: { mode: "interactions" } },
    "diffsbdd.interactions",
    "binding",
  ],
  [
    { operation: "diffsbdd", payload: { mode: "properties" } },
    "diffsbdd.properties",
    "evaluation",
  ],
  [{ operation: "docking", mode: "score" }, "gnina.score", "binding"],
  [{ operation: "docking", mode: "minimize" }, "gnina.minimize", "binding"],
  [
    { operation: "target_research", entity: "disease" },
    "discovery.disease",
    "targets",
  ],
  [
    { operation: "target_research", entity: "target" },
    "discovery.target",
    "targets",
  ],
  [{ operation: "harness", tool: "fold" }, "fold", "biologics"],
  [{ operation: "gromacs_dynamics" }, "gromacs.dynamics", "simulations"],
  [{ operation: "binding_free_energy" }, "openfe.rbfe", "simulations"],
  [{ operation: "screening_dock" }, "screening.dock", "screening"],
  [{ operation: "del_analyze" }, "del.analyze", "del"],
  [{ operation: "ternary_model" }, "deepternary.model", "proximity"],
  [{ operation: "unrecognized" }, "other", "other"],
])(
  "classifies the actual request without inferring from its name: %s",
  (request, kind, module) => {
    const job = {
      request: { name: "BRD4 descriptors · misleading task title", ...request },
    } as Job;
    expect(kindForJob(job)).toBe(kind);
    expect(moduleForKind(kind)).toBe(module);
  },
);
it("includes supporting history while keeping modules mutually exclusive", () => {
  expect(kindsForModule("molecules")).toContain("diffsbdd.edit");
  expect(kindsForModule("binding")).toContain("pose.cluster");
  expect(
    moduleCounts(
      {
        "openmm.dynamics": { total: 4, active: 1 },
        "openfe.rbfe": { total: 2, active: 0 },
        properties: { total: 3, active: 0 },
      },
      "simulations",
    ),
  ).toEqual({ total: 6, active: 1 });
});
it("encodes module, exact type, status, project, literal search and pagination", () => {
  const filter = {
    module: "binding" as const,
    type: "all",
    status: "all" as const,
    query: "STAT6 %_ +",
    page: 2,
    project: "study",
  };
  const params = new URLSearchParams(historyUrl(filter).split("?")[1]);
  expect(params.getAll("capability")).toContain("gnina.dock");
  expect(params.getAll("capability")).not.toContain("screening.dock");
  expect(params.get("q")).toBe("STAT6 %_ +");
  expect(params.get("offset")).toBe("40");
  expect(params.get("project_id")).toBe("study");
  expect(
    new URLSearchParams(
      historyUrl({ ...filter, type: "gnina.score", status: "failed" }).split(
        "?",
      )[1],
    ).getAll("capability"),
  ).toEqual(["gnina.score"]);
});
