"""Validate native and prepared evidence before shared task success or every display."""

import hashlib
import re
from types import SimpleNamespace

from ..artifacts import contained
from ..receptors.preparation_options import PreparationOptions
from ..receptors.preparation_result import validate_preparation
from .manifest import RADII_SHA256, VERSION
from .result_geometry import validate_context, validate_geometry
from .result_models import ChannelResult

ARTIFACTS = {
    "prepared.cif",
    "channels.csv",
    "channel-points.csv",
    "context-source.pdb",
    "context-native.pdb",
    "context-map.json",
    "tunnel_profiles.csv",
    "tunnel_characteristics.csv",
    "origins.pdb",
    "v_origins.pdb",
}


def validate_channels(value, request, output):
    result = ChannelResult.model_validate(value)
    if (
        result.structure != request.structure
        or result.options != request.options
        or (result.starting_regions != request.starting_regions)
    ):
        raise ValueError("The channel result differs from its exact inputs or conditions.")
    if (
        result.versions != {"caver": VERSION, "biopython": "1.88"}
        or result.preparation.versions != {"biopython": "1.88"}
        or (result.context.radius_table_sha256 != RADII_SHA256)
    ):
        raise ValueError("Native channel software or radius definitions changed.")
    if set(result.artifacts) != ARTIFACTS:
        raise ValueError("The channel evidence does not match the complete native inventory.")
    size = 0
    for name, digest in result.artifacts.items():
        file = contained(output, name)
        size += file.stat().st_size
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("The native artifact digest is invalid.")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != digest:
                raise ValueError("Native channel evidence changed after computation.")
    if size > 128 * 1024**2:
        raise ValueError("Channel evidence exceeds its total native artifact budget.")
    stage = SimpleNamespace(
        structure=request.structure,
        options=PreparationOptions.model_validate(request.options.preparation_parameters()),
    )
    validate_preparation(result.preparation.model_dump(mode="json"), stage, output)
    validate_context(result, request, output)
    validate_geometry(result, output)
    return result
