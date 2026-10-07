"""Independent file/frame and native-profile consistency for displayed channel geometry."""

import json
import math

from ..artifacts import contained
from .caver_profiles import read_profiles
from .native_execution import point
from .pdb_frame import canonical_pdb, source_channels, source_position


def validate_geometry(result, output):
    expected, frame = canonical_pdb(
        contained(output, "context-source.pdb").read_bytes(),
        result.requested_start,
    )
    if expected != contained(output, "context-native.pdb").read_bytes():
        raise ValueError("Native obstacle coordinates differ from the declared source frame.")
    actual = result.frame.model_dump(mode="json")
    for key in ("method", "context_anchor", "coordinate_unit"):
        if actual[key] != frame[key]:
            raise ValueError("The computational frame anchor or method changed.")
    for key in ("origin", "basis"):
        left, right = actual[key], frame[key]
        if key == "origin":
            left, right = [left], [right]
        if any(math.dist(a, b) > 1e-10 for a, b in zip(left, right, strict=True)):
            raise ValueError(
                "Computational coordinates do not retain their proper source transform."
            )
    if (
        abs(actual["observed_rounding_error_angstrom"] - frame["observed_rounding_error_angstrom"])
        > 1e-9
    ):
        raise ValueError("Native PDB export error differs from its verified geometry.")
    native = read_profiles(
        contained(output, "tunnel_profiles.csv"),
        "context.pdb",
        maximum_tunnels=result.options.maximum_candidates,
        maximum_points=50000,
    )
    restored = source_channels(native, actual)
    rows = [row.model_dump(mode="json") for row in result.channels]
    if len(restored) != len(rows):
        raise ValueError("The channel result lost native path coverage.")
    for expected_row, shown in zip(restored, rows, strict=True):
        if {k: v for k, v in expected_row.items() if k != "points"} != {
            k: v for k, v in shown.items() if k != "points"
        } or len(expected_row["points"]) != len(shown["points"]):
            raise ValueError("Native channel measurements or point coverage changed.")
        for expected_point, shown_point in zip(
            expected_row["points"], shown["points"], strict=True
        ):
            for key, value in expected_point.items():
                if key == "position":
                    if math.dist(value, shown_point[key]) > 1e-8:
                        raise ValueError(
                            "Displayed channel coordinates differ from the original frame."
                        )
                elif key == "sample_polyline_distance_angstrom":
                    if abs(value - shown_point[key]) > 1e-8:
                        raise ValueError(
                            "Displayed polyline distance differs from native positions."
                        )
                elif value != shown_point[key]:
                    raise ValueError("Native radius, sampling or unknown error evidence changed.")
    start = point(contained(output, "v_origins.pdb"))
    origin = point(contained(output, "origins.pdb"))
    distance = math.dist(start, origin)
    if math.dist(origin, [0, 0, 0]) > 0.003 or distance > (
        result.options.maximum_start_displacement_angstrom + 0.003
    ):
        raise ValueError("Native CAVER used another origin or exceeded its displacement bound.")
    if (
        math.dist(source_position(start, actual), result.native_start) > 1e-8
        or abs(distance - result.native_start_displacement_angstrom) > 1e-8
    ):
        raise ValueError("Native starting-point provenance changed.")


def validate_context(result, request, output):
    file = contained(output, "context-map.json")
    if file.stat().st_size > 16 * 1024**2:
        raise ValueError("Native atom identities exceed their bounded map size.")
    value = json.loads(file.read_text())
    context = result.context.model_dump(mode="json")
    for key in ("source", "quality", "radius_table_sha256"):
        if value.get(key) != context[key]:
            raise ValueError("Native structural context metadata changed.")
    if value.get("starting_regions") != [
        r.model_dump(mode="json") for r in request.starting_regions
    ]:
        raise ValueError("The starting components differ from the selected scientific identities.")
    atoms = value.get("atoms", [])
    if len(atoms) != context["obstacle_atoms"] or {
        row.get("native_serial") for row in atoms
    } != set(range(1, len(atoms) + 1)):
        raise ValueError("Native obstacle identities are incomplete or ambiguous.")
    observed = {}
    for line in contained(output, "context-source.pdb").read_text().splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            serial = int(line[6:11])
            if serial in observed:
                raise ValueError("The native obstacle serial namespace is ambiguous.")
            observed[serial] = (
                [float(line[i : i + 8]) for i in (30, 38, 46)],
                line[76:78].strip().upper(),
            )
    if set(observed) != {row["native_serial"] for row in atoms}:
        raise ValueError("The original-frame obstacle file has incomplete atom coverage.")
    for row in atoms:
        position = row.get("source_position", [])
        radius = row.get("native_radius_angstrom")
        if (
            len(position) != 3
            or any(
                isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                for v in position
            )
            or not isinstance(radius, (int, float))
            or isinstance(radius, bool)
            or not math.isfinite(radius)
            or not 0 < radius <= 4
        ):
            raise ValueError("Mapped obstacle coordinates or native radius are invalid.")
        actual_position, element = observed[row["native_serial"]]
        if (
            math.dist(position, actual_position) > math.sqrt(3) * 0.0005 + 1e-6
            or element != row.get("source_element", "").upper()
        ):
            raise ValueError("Mapped obstacle positions or elements differ from native export.")
    selected = value.get("starting_atoms", [])
    if not 1 <= len(selected) <= 500:
        raise ValueError("The starting center lacks complete observed-atom evidence.")
    allowed = [r.model_dump(mode="json") for r in request.starting_regions]
    if any(
        row.get("source_residue") not in allowed
        or row.get("source_element", "").upper() in {"H", "D"}
        for row in selected
    ):
        raise ValueError("The starting center contains unselected or non-heavy atom identities.")
    keys = [
        json.dumps([row["source_residue"], row["source_atom"]], sort_keys=True) for row in selected
    ]
    if len(set(keys)) != len(keys) or any(
        not any(row["source_residue"] == region for row in selected) for region in allowed
    ):
        raise ValueError("The selected starting atom identities are duplicated or incomplete.")
    positions = [row["source_position"] for row in selected]
    if any(
        len(p) != 3
        or any(
            not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
            for v in p
        )
        for p in positions
    ):
        raise ValueError("The starting atom coordinates are not finite.")
    center = [sum(p[index] for p in positions) / len(positions) for index in range(3)]
    if (
        math.dist(center, result.requested_start) > 1e-8
        or math.dist(result.context.source_point, result.frame.origin) > 1e-8
    ):
        raise ValueError("The requested origin is not the selected heavy-atom center.")
    removed = value.get("removed_starting_ligands", [])
    allowed = [r.model_dump(mode="json") for r in request.starting_regions]
    if (
        len(removed) != context["removed_starting_ligand_count"]
        or any(row not in allowed for row in removed)
        or (removed and not request.options.remove_starting_ligands)
    ):
        raise ValueError("An unselected component was removed from the obstacle context.")
