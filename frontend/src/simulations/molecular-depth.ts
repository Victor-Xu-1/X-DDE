import type { Camera } from "molstar/lib/mol-canvas3d/camera";
import { bindingDepth } from "./molecular-focus";

/** Requested state arrives before an active native transition updates camera.state. */
export function maintainBindingDepth(
  camera: Camera,
  sceneRadius: () => number,
) {
  let active = true;
  let applying = false;
  const subscription = camera.stateChanged.subscribe((requested) => {
    if (!active || applying) return;
    const snapshot = { ...camera.getSnapshot(), ...requested };
    const radius = Math.min(sceneRadius(), snapshot.radiusMax);
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(snapshot.radius) ||
      snapshot.radius >= radius
    )
      return;
    applying = true;
    try {
      camera.setState(bindingDepth(snapshot, radius), 0);
    } finally {
      applying = false;
    }
  });
  return {
    unsubscribe() {
      active = false;
      subscription.unsubscribe();
    },
  };
}
