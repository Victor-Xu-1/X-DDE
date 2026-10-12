import { expect, it, vi } from "vitest";
import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import { maintainBindingDepth } from "./molecular-depth";

it("corrects an active native transition once instead of recursively emitting camera requests", () => {
  const camera = new Camera();
  camera.setState({ radius: 40, radiusMax: 40 }, 0);
  const cleanup = maintainBindingDepth(camera, () => 40);
  const change = vi.spyOn(camera, "setState");
  const position = Vec3.create(3, 4, 30);
  const target = Vec3.create(3, 4, 5);
  camera.setState({ radius: 8, position, target }, 250);
  expect(change).toHaveBeenCalledTimes(2); // User request and one depth correction.
  expect(change.mock.calls[1][0].position).toEqual(position);
  expect(change.mock.calls[1][0].target).toEqual(target);
  expect(change.mock.calls[1][0].radius).toBe(40);
  camera.transition.tick(250);
  expect(camera.state.radius).toBe(40);
  expect(camera.position).toEqual(position);
  cleanup.unsubscribe();
});

it("bounds depth to native radiusMax and stops changing the camera after disposal", () => {
  const camera = new Camera();
  camera.setState({ radius: 8, radiusMax: 20 }, 0);
  const cleanup = maintainBindingDepth(camera, () => 40);
  expect(camera.state.radius).toBe(20);
  cleanup.unsubscribe();
  camera.setState({ radius: 2 }, 0);
  expect(camera.state.radius).toBe(2);
});

it("unknown scene geometry is not replaced with an invented camera extent", () => {
  const camera = new Camera();
  camera.setState({ radius: 8, radiusMax: 40 }, 0);
  const cleanup = maintainBindingDepth(camera, () => NaN);
  expect(camera.state.radius).toBe(8);
  cleanup.unsubscribe();
});
