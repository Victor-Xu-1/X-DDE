import type { PreparedExample } from "./types";

type Payload = Record<string, unknown>;

function bindings(tool: string, payload: Payload) {
  if (tool === "epitope")
    return [
      payload.structure_path,
      payload.antibody_chains,
      payload.antigen_chains,
      payload.cdr_regions,
    ];
  if (tool === "fold") {
    const candidates = payload.candidates as { chains?: unknown }[] | undefined;
    const options = payload.options as Payload | undefined;
    return [
      candidates?.map((value) => value.chains),
      options?.binder_chain_ids,
      options?.cdr_regions,
      options?.cdr3_positions,
    ];
  }
  return null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

export function antibodyInputReference(
  tool: string,
  payload: Payload,
  example: PreparedExample,
) {
  const object = example.objects.antibody_cdr_inputs;
  const request = example.request;
  if (
    !object ||
    object.kind !== "analysis" ||
    request?.operation !== "harness" ||
    request.tool !== tool
  )
    return null;
  const original = bindings(tool, request.payload);
  if (!original || canonical(original) !== canonical(bindings(tool, payload)))
    return null;
  return request.scientific_inputs?.some(
    (reference) => canonical(reference) === canonical(object.reference),
  )
    ? object.reference
    : null;
}
