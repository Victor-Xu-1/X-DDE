import type * as mol from "3dmol";
import { nativeLabelLayer } from "./native-labels";
export interface AttachmentGeometry {
  points: {
    origin: [number, number, number];
    target: [number, number, number];
    fromAtom: number;
    toAtom: number;
    region: "a" | "b";
    label: string;
  }[];
}
const finitePoint = (p: unknown): p is [number, number, number] =>
  Array.isArray(p) &&
  p.length === 3 &&
  p.every(
    (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000,
  );
export function attachmentGeometry(
  value: unknown,
): AttachmentGeometry | undefined {
  if (value === undefined) return undefined;
  const geometry = value as AttachmentGeometry;
  if (
    !geometry ||
    !Array.isArray(geometry.points) ||
    geometry.points.length > 16 ||
    geometry.points.some(
      (p) =>
        !p ||
        !finitePoint(p.origin) ||
        !finitePoint(p.target) ||
        !Number.isInteger(p.fromAtom) ||
        !Number.isInteger(p.toAtom) ||
        p.fromAtom < 0 ||
        p.toAtom < 0 ||
        p.fromAtom > 255 ||
        p.toAtom > 255 ||
        p.fromAtom === p.toAtom ||
        !["a", "b"].includes(p.region) ||
        typeof p.label !== "string" ||
        p.label.length > 80 ||
        Math.hypot(...p.target.map((n, i) => n - p.origin[i])) <= 0.000001,
    )
  )
    throw new Error("Invalid observed attachment geometry");
  return {
    points: geometry.points.map((p) => ({
      ...p,
      origin: [...p.origin],
      target: [...p.target],
    })),
  };
}
const xyz = (p: number[]) => ({ x: p[0], y: p[1], z: p[2] });
export function matchAttachmentAtoms(
  viewer: mol.GLViewer,
  geometry?: AttachmentGeometry,
) {
  if (!geometry?.points.length) return [];
  const atoms = viewer.selectedAtoms({ model: 0, chain: "L", resn: "XLG" });
  return geometry.points.map((point) => {
    const first = atoms[point.fromAtom],
      second = atoms[point.toAtom];
    const matches = (atom: mol.AtomSpec | undefined, position: number[]) =>
      atom &&
      [atom.x, atom.y, atom.z].every(
        (n, i) =>
          typeof n === "number" &&
          Number.isFinite(n) &&
          Math.abs(n - position[i]) <= 0.0011,
      );
    if (!matches(first, point.origin) || !matches(second, point.target))
      throw new Error(
        "Attachment markers do not match the displayed native ligand pose",
      );
    return { point, first, second };
  });
}
/** Arrows annotate existing bonds in the native whole-complex ligand; no atoms move. */
export function paintAttachments(
  viewer: mol.GLViewer,
  geometry?: AttachmentGeometry,
  hidden = new Set<number>(),
) {
  let count = 0;
  for (const { point, first, second } of matchAttachmentAtoms(
    viewer,
    geometry,
  )) {
    if (hidden.has(first.index!) || hidden.has(second.index!)) continue;
    const delta = point.target.map((n, i) => n - point.origin[i]);
    const length = Math.hypot(...delta);
    const tip = point.origin.map((n, i) => n + (delta[i] / length) * 3);
    const color = point.region === "a" ? "#d77725" : "#5361dc";
    viewer.addArrow({
      start: xyz(point.origin),
      end: xyz(tip),
      radius: 0.11,
      mid: 0.7,
      color,
    });
    nativeLabelLayer(viewer).add(point.label, {
      position: xyz(tip),
      fontSize: 12,
      fontColor: color,
      backgroundColor: "#ffffff",
      backgroundOpacity: 0.8,
      showBackground: true,
    });
    count++;
  }
  return count;
}
