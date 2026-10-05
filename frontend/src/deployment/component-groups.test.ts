import { expect, it } from "vitest";
import { componentGroups } from "./component-groups";
import { packageOf } from "./fixtures";

it("keeps every supplied package exactly once including future catalogue additions", () => {
  const packages = [
    packageOf("ketcher"),
    packageOf("chemistry"),
    packageOf("p2rank-compute"),
    packageOf("p2rank"),
    packageOf("harness"),
    packageOf("standard", { engine: "opendde", kind: "model" }),
    packageOf("diffsbdd", { engine: "diffsbdd" }),
    packageOf("diffsbdd-model-new", { engine: "diffsbdd", kind: "model" }),
    packageOf("sapiens"),
    packageOf("new-model", { engine: "new-engine", kind: "model" }),
  ];
  const grouped = componentGroups(packages).flatMap((g) =>
    g.packages.map((p) => p.id),
  );
  expect(grouped).toHaveLength(packages.length);
  expect(new Set(grouped)).toEqual(new Set(packages.map((p) => p.id)));
  expect(componentGroups(packages).at(-1)?.packages[0].id).toBe("new-model");
});
it("does not add large search databases or all model weights to recommended bundles", () => {
  const groups = componentGroups([
    packageOf("standard", { engine: "opendde", kind: "model" }),
    packageOf("opendde-search", { engine: "opendde", kind: "model" }),
    packageOf("abag", { engine: "opendde", kind: "model" }),
    packageOf("diffsbdd", { engine: "diffsbdd" }),
    packageOf("diffsbdd-model-crossdocked_ca_cond", {
      engine: "diffsbdd",
      kind: "model",
    }),
    packageOf("diffsbdd-model-moad_fullatom_joint", {
      engine: "diffsbdd",
      kind: "model",
    }),
  ]);
  expect(groups[0].recommended).toEqual([
    "compute",
    "standard",
    "boltz",
    "boltz-models",
  ]);
  expect(groups[1].recommended).toEqual([
    "diffsbdd",
    "diffsbdd-model-crossdocked_ca_cond",
  ]);
  expect(groups.flatMap((g) => g.recommended)).not.toContain("opendde-search");
  expect(groups[1].packages).toHaveLength(3);
});
