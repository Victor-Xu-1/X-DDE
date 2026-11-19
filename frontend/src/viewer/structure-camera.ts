import type { ViewportSize } from "./camera-resize";

export type StructureCamera = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type StructureCameraSnapshot = {
  camera: StructureCamera;
  viewport: ViewportSize;
};

export interface StructureCameraHandle {
  read(): Promise<StructureCameraSnapshot | null>;
  apply(snapshot: StructureCameraSnapshot): void;
}

export function isCameraSnapshot(
  value: unknown,
): value is StructureCameraSnapshot {
  if (!value || typeof value !== "object") return false;
  const { camera, viewport } = value as StructureCameraSnapshot;
  return (
    isStructureCamera(camera) &&
    Boolean(
      viewport &&
      [viewport.width, viewport.height].every(
        (size) => Number.isFinite(size) && size > 0 && size <= 100000,
      ),
    )
  );
}

export function isStructureCamera(value: unknown): value is StructureCamera {
  if (!Array.isArray(value) || value.length !== 8) return false;
  for (let index = 0; index < value.length; index++) {
    if (typeof value[index] !== "number" || !Number.isFinite(value[index]))
      return false;
  }
  const rotation = Math.hypot(value[4], value[5], value[6], value[7]);
  return (
    value.slice(0, 4).every((entry) => Math.abs(entry) <= 1e7) &&
    rotation > 0.99 &&
    rotation < 1.01
  );
}
