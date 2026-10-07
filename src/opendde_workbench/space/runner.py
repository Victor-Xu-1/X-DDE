"""Native channel geometry only; task, asset and environment authorities remain X-DDE."""

import hashlib
import json
import math
from pathlib import Path

from caver_profiles import read_profiles
from exports import write_exports
from manifest import SNAPSHOT, VERSION
from native_context import prepare_context
from native_execution import execute, point
from native_preparation import run_preparation
from options import ChannelOptions
from pdb_frame import canonical_pdb, source_channels, source_position
from preparation_options import PreparationOptions
from surface_options import SurfaceRegion


def run(request, bindings, directory, output):
    import Bio

    if request["operation"] != "channel_analysis" or request.get("constraints"):
        raise ValueError("This adapter measures observed geometry; it does not optimize poses.")
    options = ChannelOptions.model_validate(request["options"])
    regions = [
        SurfaceRegion.model_validate(row).model_dump() for row in request["starting_regions"]
    ]
    preparation_options = PreparationOptions.model_validate(options.preparation_parameters())
    preparation = run_preparation(
        {
            "operation": "structure_prepare",
            "structure": request["structure"],
            "options": preparation_options.model_dump(mode="json"),
        },
        bindings,
        directory,
        output,
    )
    prepared_file = output / preparation["artifact"]
    raw, origin, context = prepare_context(
        prepared_file,
        regions,
        options.model_copy(update={"model_index": 0}),
        output,
    )
    local, frame = canonical_pdb(raw.read_bytes(), origin)
    inputs = output / "native-input"
    inputs.mkdir()
    (inputs / SNAPSHOT).write_bytes(local)
    (output / "context-native.pdb").write_bytes(local)
    artifacts = execute(inputs, output, options)
    artifacts[preparation["artifact"]] = preparation["sha256"]
    native = read_profiles(
        output / "tunnel_profiles.csv",
        SNAPSHOT,
        maximum_tunnels=options.maximum_candidates,
        maximum_points=50000,
    )
    rows = source_channels(native, frame)
    actual = point(output / "v_origins.pdb")
    requested = point(output / "origins.pdb")
    if math.dist(requested, [0, 0, 0]) > 0.003:
        raise ValueError("Native CAVER used another starting point.")
    if math.dist(actual, requested) > options.maximum_start_displacement_angstrom + 0.003:
        raise ValueError("Native starting-point displacement exceeded the declared bound.")
    write_exports(rows, output)
    for name in (
        "channels.csv",
        "channel-points.csv",
        "context-source.pdb",
        "context-native.pdb",
        "context-map.json",
    ):
        artifacts[name] = hashlib.sha256((output / name).read_bytes()).hexdigest()
    return {
        "operation": "channel_analysis",
        "complete": True,
        "schema_version": 1,
        "structure": request["structure"],
        "starting_regions": request["starting_regions"],
        "options": request["options"],
        "frame": frame,
        "preparation": preparation,
        "context": context,
        "channels": rows,
        "requested_start": origin,
        "native_start": source_position(actual, frame),
        "native_start_displacement_angstrom": math.dist(actual, requested),
        "coordinate_frame": "original_selected_structural_model",
        "coordinate_unit": "angstrom",
        "search_scope": "declared_probe_and_bounded_native_candidates",
        "outcome": "paths_found" if rows else "not_found_within_declared_conditions",
        "artifacts": artifacts,
        "versions": {"caver": VERSION, "biopython": Bio.__version__},
        "scientific_scope": "static_geometric_channels_not_whole_linker_passage_or_energy",
    }


def main():
    directory, output = Path("/input"), Path("/output")
    result = run(
        json.loads((directory / "request.json").read_text()),
        json.loads((directory / "bindings.json").read_text()),
        directory,
        output,
    )
    body = json.dumps(result, allow_nan=False)
    if len(body.encode()) > 20 * 1024**2:
        raise ValueError("Channel geometry exceeded the 20 MiB structured result budget.")
    (output / "result.json").write_text(body)


if __name__ == "__main__":
    main()
