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
