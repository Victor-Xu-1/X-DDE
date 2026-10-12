import { expect, it, vi } from "vitest";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import type { StateObjectSelector } from "molstar/lib/mol-state";
import type { PluginStateObject as SO } from "molstar/lib/mol-plugin-state/objects";
import { MolecularSurfaces } from "./molecular-surfaces";

const { hidden } = vi.hoisted(() => ({ hidden: vi.fn() }));
vi.mock("molstar/lib/mol-plugin/behavior/static/state", () => ({
  setSubtreeVisibility: hidden,
}));
vi.mock(
  "molstar/lib/mol-repr/structure/representation/molecular-surface",
  () => ({ MolecularSurfaceRepresentationProvider: "native-surface" }),
);
vi.mock("./charge-theme", () => ({ ChargeTheme: "native-charge-theme" }));

function fixture() {
  const create = vi.fn().mockResolvedValue({ ref: "surface" });
  const remove = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);
  const plugin = {
    state: { data: {} },
    builders: { structure: { representation: { addRepresentation: create } } },
    build: () => ({ delete: remove, commit }),
  } as unknown as PluginContext;
  const surfaces = new MolecularSurfaces(plugin);
  const polymer = {
    ref: "protein",
  } as StateObjectSelector<SO.Molecule.Structure>;
  surfaces.register(polymer);
  surfaces.register(polymer);
  return { surfaces, create, remove, commit, polymer };
}

it("registration alone creates no mesh; concurrent requests share one native surface", async () => {
  const f = fixture();
  expect(f.create).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  const [a, b] = await Promise.all([
    f.surfaces.ensure(signal),
    f.surfaces.ensure(signal),
  ]);
  expect(a).toEqual(["surface"]);
  expect(b).toEqual(a);
  expect(f.create).toHaveBeenCalledTimes(1);
  expect(f.create).toHaveBeenCalledWith(f.polymer, {
    type: "native-surface",
    typeParams: { alpha: 0.45, ignoreHydrogens: true },
    color: "native-charge-theme",
  });
  expect(hidden).toHaveBeenCalledWith(expect.anything(), "surface", true);
});

it("turning surfaces off removes native geometry so later trajectory frames do not update it", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  await f.surfaces.ensure(signal);
  await f.surfaces.discard();
  expect(f.remove).toHaveBeenCalledWith("surface");
  expect(f.commit).toHaveBeenCalledTimes(1);
  await f.surfaces.ensure(signal);
  expect(f.create).toHaveBeenCalledTimes(2);
});

it("native failures remain failures and a later explicit request can retry", async () => {
  const f = fixture(),
    failure = new Error("native mesh failed");
  f.create.mockRejectedValueOnce(failure);
  const signal = new AbortController().signal;
  await expect(f.surfaces.ensure(signal)).rejects.toBe(failure);
  expect(f.create).toHaveBeenCalledTimes(1);
  await expect(f.surfaces.ensure(signal)).resolves.toEqual(["surface"]);
});

it("a cancelled request does not begin native mesh creation", async () => {
  const f = fixture(),
    stop = new AbortController();
  stop.abort();
  await expect(f.surfaces.ensure(stop.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(f.create).not.toHaveBeenCalled();
});
