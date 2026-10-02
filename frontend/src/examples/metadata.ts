import type { ExampleInfo } from "./types";
export function reviewedExample(
  value: unknown,
  capability: string,
): value is ExampleInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<ExampleInfo>,
    study = info.case;
  return (
    info.module?.capability_id === capability &&
    Boolean(study) &&
    Array.isArray(study?.label) &&
    study.label.length === 2 &&
    study.label.every((v) => typeof v === "string") &&
    Array.isArray(study?.description) &&
    study.description.length === 2 &&
    study.description.every((v) => typeof v === "string") &&
    Array.isArray(study?.sources) &&
    study.sources.every(
      (v) => typeof v === "string" && v.startsWith("https://"),
    ) &&
    Array.isArray(info.files) &&
    info.files.every((v) => v && typeof v.license === "string") &&
    (info.pin === null ||
      Boolean(info.pin && typeof info.pin.job_id === "string"))
  );
}
