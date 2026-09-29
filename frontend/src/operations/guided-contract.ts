import { harnessFields } from "./harness-fields";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown) =>
  record(value) && Object.values(value).every((v) => typeof v === "string");
const numbers = (value: unknown) =>
  Array.isArray(value) &&
  value.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0);

/** Keep rich native JSON in Expert mode when the guided editor cannot represent it losslessly. */
export function canGuide(
  tool: string,
  payload: Record<string, unknown>,
): boolean {
  if (tool === "fold") {
    const options = payload.options;
    return (
      record(options) &&
      strings(options.target_chains) &&
      Array.isArray(payload.candidates) &&
      payload.candidates.every(
        (c) =>
          record(c) && typeof c.candidate_id === "string" && strings(c.chains),
      )
    );
  }
  return (harnessFields[tool] ?? []).every((field) => {
    const value = payload[field.key];
    if (field.kind === "choice")
      return Boolean(field.choices?.some((c) => c.value === value));
    if (field.kind === "chains") return strings(value);
    if (field.kind === "positions")
      return (
        strings(payload.parent_chains) &&
        (Array.isArray(value)
          ? tool === "mpnn" && value.every((v) => typeof v === "string")
          : record(value) && Object.values(value).every(numbers))
      );
    if (field.kind === "cdr")
      return (
        record(value) &&
        Object.values(value).every(
          (v) => record(v) && Object.values(v).every(numbers),
        )
      );
    if (["assets", "chain-list", "lines"].includes(field.kind))
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    if (field.kind === "number")
      return typeof value === "number" && Number.isFinite(value);
    return value === undefined || typeof value === "string";
  });
}
