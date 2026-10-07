import type * as mol from "3dmol";
import { finiteCoordinates } from "./geometry";
export interface ChannelGeometry {
  points: { position: [number, number, number]; radius_angstrom: number }[];
  envelope: boolean;
}
export function channelGeometry(value: unknown): ChannelGeometry | undefined {
  if (value === undefined) return undefined;
  const v = value as ChannelGeometry;
  if (
    !v ||
    typeof v.envelope !== "boolean" ||
    !Array.isArray(v.points) ||
    v.points.length < 2 ||
    v.points.length > 10000 ||
    v.points.some(
      (p) =>
        !p ||
        !Array.isArray(p.position) ||
        p.position.length !== 3 ||
        p.position.some(
          (n) =>
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            Math.abs(n) > 100000,
        ) ||
        typeof p.radius_angstrom !== "number" ||
        !Number.isFinite(p.radius_angstrom) ||
        p.radius_angstrom <= 0 ||
        p.radius_angstrom > 10000,
    )
  )
    throw new Error("Invalid native channel geometry");
  return {
    envelope: v.envelope,
    points: v.points.map((p) => ({
      position: [...p.position],
      radius_angstrom: p.radius_angstrom,
    })),
  };
}
const xyz = (p: number[]) => ({ x: p[0], y: p[1], z: p[2] });
/** Measured path geometry only; these shapes never enter atom identities or exports. */
export function paintChannel(viewer: mol.GLViewer, channel?: ChannelGeometry) {
  if (!channel) return;
  const points = channel.points;
  let narrow = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].radius_angstrom < points[narrow].radius_angstrom) narrow = i;
    if (i && points[i].position.some((n, k) => n !== points[i - 1].position[k]))
      viewer.addCylinder({
        start: xyz(points[i - 1].position),
        end: xyz(points[i].position),
        radius: 0.2,
        color: "#2265e4",
        fromCap: 1,
        toCap: 1,
      });
  }
  if (channel.envelope) {
    const stride = Math.max(1, Math.ceil(points.length / 160));
    for (let i = 0; i < points.length; i += stride)
      viewer.addSphere({
        center: xyz(points[i].position),
        radius: points[i].radius_angstrom,
        color: "#66b3e7",
        opacity: 0.3,
      });
  }
  viewer.addSphere({
    center: xyz(points[narrow].position),
    radius: points[narrow].radius_angstrom,
    color: "#eea545",
    opacity: 0.34,
  });
  viewer.addLabel(points[narrow].radius_angstrom.toFixed(2) + " Å", {
    position: xyz(points[narrow].position),
    fontSize: 12,
    fontColor: "#915509",
    backgroundColor: "#ffffff",
    backgroundOpacity: 0.85,
    borderThickness: 0,
    inFront: true,
  });
}

/** Focus real source atoms around the measured path; never create pseudo-atoms. */
export function focusChannel(viewer: mol.GLViewer, channel: ChannelGeometry) {
  const lower = [Infinity, Infinity, Infinity],
    upper = [-Infinity, -Infinity, -Infinity];
  for (const point of channel.points)
    for (let axis = 0; axis < 3; axis++) {
      lower[axis] = Math.min(
        lower[axis],
        point.position[axis] - point.radius_angstrom - 4,
      );
      upper[axis] = Math.max(
        upper[axis],
        point.position[axis] + point.radius_angstrom + 4,
      );
    }
  const selection: mol.AtomSelectionSpec = {
    model: 0,
    predicate: (atom) => {
      const position = finiteCoordinates(atom);
      return Boolean(
        position &&
        position.every((v, axis) => v >= lower[axis] && v <= upper[axis]),
      );
    },
  };
  if (!viewer.selectedAtoms(selection).length)
    throw new Error(
      "The channel does not overlap the displayed source context",
    );
  viewer.zoomTo(selection);
  viewer.zoom(0.9);
  viewer.render();
}
