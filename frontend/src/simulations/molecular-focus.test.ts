import { expect, it } from "vitest";
import {
  bindingDepth,
  bindingFocusOptions,
  selectedLigandFocus,
} from "./molecular-focus";
import type { Loci } from "molstar/lib/mol-model/loci";
import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";

const a = { kind: "every-loci" } as Loci;
const b = { kind: "empty-loci" } as Loci;
it("focuses the selected native alternative without replacing its identity", () => {
  expect(selectedLigandFocus([a, b], "a")).toEqual([a]);
  expect(selectedLigandFocus([a, b], "b")).toEqual([b]);
  expect(selectedLigandFocus([a, b], "b")[0]).toBe(b);
  expect(selectedLigandFocus([a, b], "all")).toEqual([a, b]);
});
it("does not silently focus A when requested B is absent", () => {
  expect(selectedLigandFocus([a], "b")).toEqual([]);
  expect(selectedLigandFocus([], "all")).toEqual([]);
});
it("uses native obstruction-aware focus without a transient export camera", () => {
  expect(bindingFocusOptions.optimizeDirection).toBe(true);
  expect(bindingFocusOptions.durationMs).toBe(0);
  expect(bindingFocusOptions.extraRadius).toBeGreaterThan(0);
});

it("widens scene depth without changing the selected binding view's position, target or zoom", () => {
  const camera = new Camera();
  camera.setState({ radiusMax: 40 });
  const close = Camera.copySnapshot(
    Camera.createDefaultSnapshot(),
    camera.getFocus(Vec3.create(3, 4, 5), 8),
  );
  const complete = bindingDepth(close, 40);
  expect(complete.position).toBe(close.position);
  expect(complete.target).toBe(close.target);
  expect(complete.fov).toBe(close.fov);
  expect(complete.radius).toBe(40);
  expect(complete.clipFar).toBe(false);
  expect(close.radius).toBe(8);
  camera.setState(complete);
  camera.update();
  expect(camera.near).toBeLessThan(
    Vec3.distance(complete.position, complete.target) - 8,
  );
});
