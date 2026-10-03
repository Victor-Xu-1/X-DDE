export interface ViewerLoad {
  urls: string[];
  comparison: boolean;
  focusModel?: number;
  records?: number[];
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
  if (
    typeof v.comparison !== "boolean" ||
    (v.focusModel !== undefined &&
      (!Number.isInteger(v.focusModel) ||
        Number(v.focusModel) < 0 ||
        Number(v.focusModel) >= v.urls.length))
  )
    throw new Error("Invalid structure layout");
  if (
    v.records !== undefined &&
    (!Array.isArray(v.records) ||
      v.records.length !== v.urls.length ||
      v.records.some((n) => !Number.isInteger(n) || n < 0 || n > 9999))
  )
    throw new Error("Invalid molecular records");
  return {
    urls: v.urls as string[],
    ...(v.records === undefined ? {} : { records: v.records as number[] }),
    comparison: v.comparison,
    ...(v.focusModel === undefined ? {} : { focusModel: Number(v.focusModel) }),
  };
}
