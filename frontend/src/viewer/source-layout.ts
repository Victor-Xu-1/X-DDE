import { nativeInteractions, type PotentialMap } from "./scientific-data";
import type { NativeInteraction } from "../integrations/types";
import { channelGeometry, type ChannelGeometry } from "./channel-geometry";
export interface ViewerLoad {
  channelGeometry?: ChannelGeometry;
  urls: string[];
  comparison: boolean;
  focusModel?: number;
  focusModels?: number[];
  records?: number[];
  nativeInteractions?: NativeInteraction[];
  electrostaticMap?: PotentialMap;
}
/** A receptor and its separately stored pose are one complex, not a comparison. */
export function complexLigandModel(
  formats: string[],
  input: ViewerLoad,
): number | null {
  return !input.comparison &&
    input.focusModel === 1 &&
    formats.length === 2 &&
    ["pdb", "cif"].includes(formats[0]) &&
    ["sdf", "mol", "mol2"].includes(formats[1])
    ? 1
    : null;
}
export function viewerLoad(value: unknown): ViewerLoad {
  if (!value || typeof value !== "object")
    throw new Error("Invalid structure request");
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v.urls) ||
    v.urls.length < 1 ||
    v.urls.length > 3 ||
    v.urls.some((url) => typeof url !== "string")
  )
    throw new Error("Invalid structure sources");
  const sourceCount = v.urls.length;
  if (
    typeof v.comparison !== "boolean" ||
    (v.focusModel !== undefined &&
      (!Number.isInteger(v.focusModel) ||
        Number(v.focusModel) < 0 ||
        Number(v.focusModel) >= v.urls.length))
  )
    throw new Error("Invalid structure layout");
  if (
    v.focusModels !== undefined &&
    (v.focusModel !== undefined ||
      !Array.isArray(v.focusModels) ||
      v.focusModels.length < 1 ||
      v.focusModels.length > v.urls.length ||
      new Set(v.focusModels).size !== v.focusModels.length ||
      v.focusModels.some(
        (n) => !Number.isInteger(n) || n < 0 || n >= sourceCount,
      ))
  )
    throw new Error("Invalid comparison focus");
  if (
    v.records !== undefined &&
    (!Array.isArray(v.records) ||
      v.records.length !== v.urls.length ||
      v.records.some((n) => !Number.isInteger(n) || n < 0 || n > 9999))
  )
    throw new Error("Invalid molecular records");
  return {
    nativeInteractions: nativeInteractions(v.nativeInteractions),
    ...(v.channelGeometry === undefined
      ? {}
      : { channelGeometry: channelGeometry(v.channelGeometry) }),
    ...(v.electrostaticMap
      ? { electrostaticMap: potentialMap(v.electrostaticMap) }
      : {}),
    urls: v.urls as string[],
    ...(v.records === undefined ? {} : { records: v.records as number[] }),
    comparison: v.comparison,
    ...(v.focusModels === undefined
      ? {}
      : { focusModels: [...(v.focusModels as number[])] }),
    ...(v.focusModel === undefined ? {} : { focusModel: Number(v.focusModel) }),
  };
}
function potentialMap(value: unknown): PotentialMap {
  const map = value as PotentialMap;
  if (
    !map ||
    typeof map.url !== "string" ||
    map.unit !== "kBT/e" ||
    (map.range !== undefined &&
      (!Number.isFinite(map.range) || map.range < 1 || map.range > 20))
  )
    throw new Error("Invalid potential display request");
  return { url: map.url, unit: map.unit, range: map.range ?? 5 };
}
