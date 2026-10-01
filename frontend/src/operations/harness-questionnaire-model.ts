import { harnessFields } from "./harness-fields";
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const chains = (v: unknown) =>
  record(v) &&
  Object.keys(v).length > 0 &&
  Object.values(v).every((x) => typeof x === "string" && Boolean(x.trim()));
export function harnessInputsComplete(
  tool: string,
  payload: Record<string, unknown>,
): boolean {
  if (tool === "fold")
    return (
      record(payload.options) &&
      chains(payload.options.target_chains) &&
      Array.isArray(payload.candidates) &&
      payload.candidates.length > 0 &&
      payload.candidates.every(
        (c) =>
          record(c) &&
          typeof c.candidate_id === "string" &&
          Boolean(c.candidate_id.trim()) &&
          chains(c.chains),
      )
    );
  if (!harnessFields[tool]) return false;
  return harnessFields[tool]
    .filter((f) => f.required)
    .every((f) => {
      const v = payload[f.key];
      if (f.kind === "chains") return chains(v);
      if (f.kind === "positions")
        return Array.isArray(v)
          ? v.length > 0
          : record(v) &&
              Object.values(v).some((x) => Array.isArray(x) && x.length > 0);
      if (["assets", "chain-list", "lines"].includes(f.kind))
        return (
          Array.isArray(v) &&
          v.length > 0 &&
          v.every((x) => typeof x === "string" && Boolean(x.trim()))
        );
      return typeof v === "string" && Boolean(v.trim());
    });
}
