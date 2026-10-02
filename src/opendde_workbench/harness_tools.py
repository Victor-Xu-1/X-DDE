"""Standalone IPC contracts shared by the platform and the native Harness interpreter."""

import re

from pydantic import BaseModel, ConfigDict, Field

TOOLS = {
    "esm": ("EsmScoreRequest", "score_esm"),
    "esm2": ("Esm2GuidedProposalRequest", "generate_esm2_guided"),
    "mpnn": ("SolubleMPNNRequest", "generate_soluble_mpnn"),
    "fold": ("FoldRequest", "submit_fold"),
    "target-msa": ("TargetMsaSearchRequest", "search_target_msa"),
    "epitope": ("EpitopeAnalysisRequest", "analyze_epitope"),
    "structure": ("StructureAnalysisRequest", "analyze_structure"),
    "evolution": ("EvolutionTreeRequest", "analyze_evolution_tree"),
    "protrek-sequence": ("ProtrekSequenceSearchRequest", "search_protrek_sequence"),
    "protrek-structure": ("ProtrekStructureSearchRequest", "search_protrek_structure"),
    "rmsd": (None, "pose_rmsd"),
    "compare": (None, None),
}
FILE_FIELDS = {
    "structure_path",
    "structure_paths",
    "reference_path",
    "mobile_path",
    "candidates_json_path",
    "initial_structure_path",
    "unpaired_msa_path",
    "paired_msa_path",
    "templates_path",
    "unpairedMsaPath",
    "pairedMsaPath",
    "templatesPath",
    "legacy_path",
    "current_path",
}
BLOCKED_FIELDS = {
    "task_id",
    "output_dir",
    "cache_dir",
    "checkpoint_path",
    "model_path",
    "url",
    "api_url",
    "compute_url",
    "token",
    "api_key",
    "command",
    "image",
    "docker_image",
    "execution_mode",
    "python",
    "executable",
    "environment",
    "env",
    "headers",
    "mounts",
    "volumes",
}


def validate_identifier(value):
    if value is not None and (
        not isinstance(value, str)
        or not 1 <= len(value) <= 128
        or value in {".", ".."}
        or re.search(r"[/\\\x00-\x1f]", value)
    ):
        raise ValueError(
            "Candidate identifiers cannot contain path separators or control characters."
        )


def validate_payload(value, *, key="", depth=0):
    if depth > 16:
        raise ValueError("Scientific configuration is nested too deeply.")
    if key in {"candidate_id", "parent_id", "current_parent_id"}:
        validate_identifier(value)
    if (
        key in BLOCKED_FIELDS
        or key.lower() in {"apikey", "password", "authorization", "secret"}
        or key.endswith(("_url", "_token", "_directory", "_binary_path"))
    ):
        raise ValueError(f"{key} is server configuration, not a browser task parameter.")
    if key in FILE_FIELDS:
        values = value if isinstance(value, list) else [value]
        if any(
            not isinstance(v, str) or not re.fullmatch(r"asset:[0-9a-f-]{36}", v) for v in values
        ):
            raise ValueError(f"{key} requires an uploaded file selected in the workbench.")
        return
    if key.endswith(("_path", "_dir", "Path")):
        raise ValueError(f"Unsupported filesystem field: {key}")
    if isinstance(value, dict):
        for k, v in value.items():
            validate_payload(v, key=k, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > 10000:
            raise ValueError("An input collection is too large.")
        for item in value:
            validate_payload(item, depth=depth + 1)


class PoseComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reference_path: str
    mobile_path: str
    target_chain_ids: list[str] = Field(min_length=1, max_length=8)
    binder_chain_ids: list[str] = Field(min_length=1, max_length=8)


class PopulationComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")
    legacy_path: str
    current_path: str
    top_k: int = Field(default=20, ge=1, le=256)
    maximize: bool = False


LOCAL_MODELS = {"rmsd": PoseComparison, "compare": PopulationComparison}


def asset_references(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in FILE_FIELDS:
                for reference in item if isinstance(item, list) else [item]:
                    yield key, reference[6:]
            else:
                yield from asset_references(item)
    elif isinstance(value, list):
        for item in value:
            yield from asset_references(item)
