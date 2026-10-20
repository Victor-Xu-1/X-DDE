import { expect, it } from "vitest";
import { componentGroups } from "./component-groups";
import { packageOf } from "./fixtures";
import { componentName } from "./labels";

it("groups the full DEL cohort with its workflow without requesting a scientific environment", () => {
  const data = packageOf("public-del-examples", {
    engine: "x-dde",
    kind: "data",
    name: "DEL research examples",
  });
  const groups = componentGroups([data]);
  expect(groups).toHaveLength(1);
  expect(groups[0].id).toBe("large-libraries");
  expect(groups[0].packages).toEqual([data]);
  expect(groups[0].recommended).toContain("public-del-examples");
  expect(componentName(data, true)).toBe("DEL 完整研究示例");
  expect(componentName(data, false)).toBe("DEL research examples");
});

it("presents all interchangeable simulation engines without expanding the recommended installation", () => {
  const [group] = componentGroups([
    packageOf("openmm"),
    packageOf("gromacs"),
    packageOf("openfe"),
  ]);
  expect(group.id).toBe("simulations");
  expect(group.primary).toEqual(["openmm", "gromacs", "openfe"]);
  expect(group.recommended).toEqual(["openmm", "openfe"]);
  expect(group.packages.map((item) => item.id)).toEqual([
    "openmm",
    "gromacs",
    "openfe",
  ]);
});

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
    "reinvent",
    "reinvent-models",
  ]);
  expect(groups.flatMap((g) => g.recommended)).not.toContain("opendde-search");
  expect(groups[1].packages).toHaveLength(3);
});
