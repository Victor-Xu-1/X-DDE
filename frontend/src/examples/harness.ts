import type { PreparedExample } from "./types";

export function exampleHarnessPayload(
  tool: string,
  defaults: Record<string, unknown>,
  example: PreparedExample | null,
): Record<string, unknown> {
  const payload = structuredClone(defaults);
  if (!example) return payload;
  if (example.request?.operation === "harness" && example.request.tool === tool)
    return structuredClone(example.request.payload);
  const heavy = example.sequences.heavy;
  const light = example.sequences.light;
  const antigen = example.sequences.antigen;
  const structure = example.objects.her2
    ? `asset:${example.objects.her2.reference.asset_id}`
    : undefined;
  if (tool === "esm" && heavy && light) payload.sequences = [heavy, light];
  if (tool === "esm2" && heavy && light) {
    payload.parent_id = "trastuzumab-1N8Z";
    payload.parent_chains = { B: heavy, A: light };
    payload.mutable_positions = { B: [31, 32], A: [30, 31] };
    payload.num_sequences = 4;
  }
  if (tool === "mpnn" && structure && heavy && light) {
    payload.structure_path = structure;
    payload.parent_chains = { B: heavy, A: light };
    payload.mutable_positions = { B: [31, 32], A: [30, 31] };
    payload.num_sequences = 4;
  }
  if (tool === "fold" && heavy && light && antigen) {
    payload.candidates = [
      { candidate_id: "trastuzumab", chains: { B: heavy, A: light } },
    ];
    payload.options = {
      target_chains: { C: antigen },
      target_chain_ids: ["C"],
      binder_chain_ids: ["B", "A"],
    };
  }
  if (tool === "epitope" && structure) {
    payload.structure_path = structure;
    payload.antibody_chains = ["B", "A"];
    payload.antigen_chains = ["C"];
  }
  if (tool === "structure") {
    const complex = example.objects.mz1
      ? `asset:${example.objects.mz1.reference.asset_id}`
      : structure;
    if (complex) {
      payload.structure_paths = [complex];
      payload.candidate_names = [example.case.id];
      payload.binder_chain_ids = example.objects.mz1 ? ["D"] : ["B", "A"];
      payload.target_chain_ids = example.objects.mz1 ? ["A"] : ["C"];
    }
  }
  if (tool === "rmsd" && structure && example.objects.predicted_antibody) {
    payload.reference_path = structure;
    payload.mobile_path = `asset:${example.objects.predicted_antibody.reference.asset_id}`;
    payload.target_chain_ids = ["C"];
    payload.binder_chain_ids = ["B", "A"];
  }
  if (tool === "protrek-sequence" && heavy) payload.sequence = heavy;
  if (tool === "protrek-structure" && structure) {
    payload.structure_path = structure;
    payload.chain = "B";
  }
  if (tool === "target-msa" && example.sequences.protein) {
    payload.target_name = "BRD4 first bromodomain · 3MXF";
    payload.chain_id = "A";
    payload.sequence = example.sequences.protein;
  }
  if (tool === "evolution" && example.objects.proposal_history) {
    payload.candidates_json_path = `asset:${example.objects.proposal_history.reference.asset_id}`;
    payload.binder_chain_ids = ["B", "A"];
    payload.objective_key = "loss";
    payload.minimize = true;
    payload.current_parent_id = "trastuzumab-1N8Z";
  }
  if (
    tool === "compare" &&
    example.objects.proposal_reference &&
    example.objects.proposal_current
  ) {
    payload.legacy_path = `asset:${example.objects.proposal_reference.reference.asset_id}`;
    payload.current_path = `asset:${example.objects.proposal_current.reference.asset_id}`;
    payload.maximize = false;
    payload.top_k = 4;
  }
  return payload;
}

export function exampleHarnessInputs(
  tool: string,
  payload: Record<string, unknown>,
  example: PreparedExample | null,
) {
  if (!example) return [];
  const files = new Set<string>();
  function visit(value: unknown) {
    if (typeof value === "string" && /^asset:[0-9a-f-]{36}$/.test(value))
      files.add(value.slice(6));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object")
      Object.values(value).forEach(visit);
  }
  visit(payload);
  const sequences: string[] =
    tool === "esm"
      ? (payload.sequences as string[])
      : ["esm2", "mpnn"].includes(tool)
        ? Object.values(payload.parent_chains as Record<string, string>)
        : tool === "fold"
          ? (payload.candidates as { chains: Record<string, string> }[])
              .flatMap((c) => Object.values(c.chains))
              .concat(
                Object.values(
                  (
                    payload.options as {
                      target_chains?: Record<string, string>;
                    }
                  )?.target_chains ?? {},
                ),
              )
          : ["target-msa", "protrek-sequence"].includes(tool)
            ? [payload.sequence as string]
            : [];
  const sources = Object.entries(example.sequence_sources ?? {})
    .filter(([, values]) =>
      values.every((sequence) => sequences.includes(sequence)),
    )
    .map(([key]) => key);
  return Object.entries(example.objects)
    .filter(
      ([key, obj]) =>
        files.has(obj.reference.asset_id) || sources.includes(key),
    )
    .map(([, obj]) => obj.reference);
}
