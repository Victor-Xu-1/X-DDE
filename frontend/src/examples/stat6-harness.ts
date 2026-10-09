import type { PreparedExample } from "./types";

/** Prefill only real STAT6 inputs; antibody sequences and calculated poses require their own evidence. */
export function stat6HarnessPayload(
  tool: string,
  payload: Record<string, unknown>,
  example: PreparedExample,
) {
  const sequence = example.sequences.protein;
  const structure = `asset:${example.objects.receptor.reference.asset_id}`;
  if (tool === "esm") payload.sequences = [sequence];
  if (tool === "esm2") {
    payload.parent_id = "STAT6-P42226";
    payload.parent_chains = { A: sequence };
    payload.mutable_positions = { A: [] };
  }
  if (tool === "mpnn") {
    payload.structure_path = structure;
    payload.parent_chains = {};
    payload.mutable_positions = {};
  }
  if (tool === "fold") {
    payload.candidates = [];
    payload.options = {
      target_chains: { B: sequence },
      target_chain_ids: ["B"],
      binder_chain_ids: ["A"],
    };
  }
  if (tool === "epitope") {
    payload.structure_path = structure;
    payload.antibody_chains = [];
    payload.antigen_chains = ["A"];
  }
  if (tool === "structure") {
    payload.structure_paths = [structure];
    payload.candidate_names = ["STAT6 experimental receptor reference"];
    payload.binder_chain_ids = [];
    payload.target_chain_ids = ["A"];
  }
  if (tool === "rmsd") {
    payload.reference_path = structure;
    payload.mobile_path = `asset:${example.objects.receptor_b.reference.asset_id}`;
    payload.target_chain_ids = ["A"];
    payload.binder_chain_ids = [];
  }
  if (tool === "protrek-sequence") payload.sequence = sequence;
  if (tool === "protrek-structure") {
    payload.structure_path = structure;
    payload.chain = "A";
  }
  if (tool === "target-msa") {
    payload.target_name = "STAT6 · P42226";
    payload.chain_id = "A";
    payload.sequence = sequence;
  }
  if (tool === "evolution") {
    payload.candidates_json_path = "";
    payload.current_parent_id = "STAT6 study";
    payload.binder_chain_ids = [];
  }
  if (tool === "compare") {
    payload.legacy_path = "";
    payload.current_path = "";
  }
  return payload;
}
