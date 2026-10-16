import type { GLViewer } from "3dmol";

export interface SearchBoxGeometry {
  center: [number, number, number];
  size: [number, number, number];
  unit: "angstrom";
}

/** Explicit search conditions only; no inferred cavity or fabricated molecular atoms. */
export function searchBoxGeometry(
  value: unknown,
): SearchBoxGeometry | undefined {
  if (value === undefined) return undefined;
  const box = value as SearchBoxGeometry;
  if (
    !box ||
    box.unit !== "angstrom" ||
    !Array.isArray(box.center) ||
    box.center.length !== 3 ||
    !Array.isArray(box.size) ||
    box.size.length !== 3 ||
    box.center.some(
      (n) =>
        typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100000,
    ) ||
    box.size.some(
      (n) => typeof n !== "number" || !Number.isFinite(n) || n < 4 || n > 100,
    )
  )
    throw new Error("Invalid search box in receptor coordinates.");
  return { center: [...box.center], size: [...box.size], unit: "angstrom" };
}

export function paintSearchBox(viewer: GLViewer, box?: SearchBoxGeometry) {
  if (!box) return;
  const corners = Array.from({ length: 8 }, (_, mask) => {
    const v = box.center.map(
      (n, axis) => n + ((mask & (1 << axis) ? 1 : -1) * box.size[axis]) / 2,
    );
    return { x: v[0], y: v[1], z: v[2] };
  });
  for (let mask = 0; mask < 8; mask++)
    for (let axis = 0; axis < 3; axis++)
      if (!(mask & (1 << axis)))
        viewer.addCylinder({
          start: corners[mask],
          end: corners[mask | (1 << axis)],
          radius: 0.08,
          color: "#5577dd",
          opacity: 0.72,
          fromCap: 1,
          toCap: 1,
        });
}
