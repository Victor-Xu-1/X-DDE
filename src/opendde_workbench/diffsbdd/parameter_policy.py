"""Editable controls that the pinned native sampler actually consumes.

The task and fixed-atom identities are owned by the questionnaire, not JSON.
Legacy full option envelopes remain readable and retain their original values.
"""

from .options import DiffOptions

PARAMETER_GROUPS = {
    "common": ["model", "seed", "fragment_policy", "relaxation"],
    "generate": ["count", "steps", "size_mode"],
    "generate_joint": ["resamplings", "jump_length"],
    "inpaint": [
        "count",
        "steps",
        "size_mode",
        "resamplings",
        "preserve_bonds",
        "center",
        "trajectory",
    ],
    "diversify": ["count", "change_steps"],
    "optimize": ["change_steps", "objective", "population", "rounds", "survivors"],
    "fixed_generate": ["atoms"],
    "fixed_inpaint": ["added_atoms"],
    "sample": ["size_bias", "minimum_atoms"],
}


def editable_parameters(options: DiffOptions) -> set[str]:
    """Follow Sampler.sample/inpaint and native optimization at SOURCE_COMMIT."""
    fields = set(PARAMETER_GROUPS["common"] + PARAMETER_GROUPS[options.task])
    if options.task == "generate" and options.model.endswith("_joint"):
        fields.update(PARAMETER_GROUPS["generate_joint"])
    if options.task in {"generate", "inpaint"}:
        group = "sample" if options.size_mode == "sample" else "fixed_" + options.task
        fields.update(PARAMETER_GROUPS[group])
    return fields
