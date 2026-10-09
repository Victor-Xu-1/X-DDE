import { ligandBondRadius } from "./appearance";

/** Equal-radius atom caps close stick junctions without introducing large atom balls. */
export function molstarSticks(radius = ligandBondRadius) {
  const visuals: ("element-sphere" | "intra-bond" | "inter-bond")[] = [
    "element-sphere",
    "intra-bond",
    "inter-bond",
  ];
  return {
    type: "ball-and-stick" as const,
    typeParams: {
      ignoreHydrogens: true,
      ignoreHydrogensVariant: "non-polar" as const,
      sizeFactor: radius,
      sizeAspectRatio: 1,
      adjustCylinderLength: false,
      visuals,
    },
    size: "uniform" as const,
    sizeParams: { value: 1 },
  };
}
