"""Keep the upstream global-frame counterexample and verify the actual canonical adapter."""

import math

from opendde_workbench.space.pdb_frame import canonical_pdb


def transformed_pdb(data, shift, quarter_turn=False):
    rows = []
    for line in data.decode("ascii").splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            x, y, z = (float(line[start : start + 8]) for start in (30, 38, 46))
            if quarter_turn:
                x, y = -y, x
            xyz = [value + offset for value, offset in zip((x, y, z), shift, strict=True)]
            line = line[:30] + "".join(f"{value:8.3f}" for value in xyz) + line[54:]
        rows.append(line)
    return ("\n".join(rows) + "\n").encode("ascii")


def verify_frames(image, original, config_data, output, native):
    config_lines = config_data.decode().splitlines()
    points = [
        line.split()[1:4] for line in config_lines if line.startswith("starting_point_coordinates ")
    ]
    assert len(points) == 1
    origin = [float(v) for v in points[0]]
    config = output / "reference-config.txt"
    config.write_bytes(config_data)
    shift = (25, -15, 8)
    translated = transformed_pdb(original, shift)
    raw_input = output / "raw-inputs"
    raw_input.mkdir()
    (raw_input / "2ACE.pdb").write_bytes(original)
    raw = native(image, raw_input, config, output / "raw-reference")
    moved_lines = [
        (
            "starting_point_coordinates "
            + " ".join(str(v + d) for v, d in zip(origin, shift, strict=True))
        )
        if line.startswith("starting_point_coordinates ")
        else line
        for line in config_lines
    ]
    raw_moved_input = output / "raw-moved-inputs"
    raw_moved_input.mkdir()
    (raw_moved_input / "2ACE.pdb").write_bytes(translated)
    raw_moved_config = output / "raw-moved-config.txt"
    raw_moved_config.write_text("\n".join(moved_lines) + "\n")
    raw_moved = native(image, raw_moved_input, raw_moved_config, output / "raw-translated")
    local_config = output / "canonical-config.txt"
    local_config.write_text(
        "\n".join(
            "starting_point_coordinates 0 0 0"
            if line.startswith("starting_point_coordinates ")
            else line
            for line in config_lines
        )
        + "\n"
    )
    canonical, frame = canonical_pdb(original, origin)
    datasets = [
        ("canonical-reference", original, origin),
        ("canonical-translated", translated, [v + d for v, d in zip(origin, shift, strict=True)]),
        (
            "canonical-rotated",
            transformed_pdb(original, shift, True),
            [-origin[1] + shift[0], origin[0] + shift[1], origin[2] + shift[2]],
        ),
    ]
    values = []
    errors = []
    for label, data, point in datasets:
        current, transform = canonical_pdb(data, point)
        assert current == canonical, (
            "Common rigid motion changed normalized native atom coordinates"
        )
        inputs = output / (label + "-inputs")
        inputs.mkdir()
        (inputs / "2ACE.pdb").write_bytes(current)
        values.append(native(image, inputs, local_config, output / label))
        errors.append(transform["observed_rounding_error_angstrom"])
    reference = values[0]
    assert reference

    def signature(rows):
        return sorted((r["bottleneck_radius_angstrom"], r["length_angstrom"]) for r in rows)

    difference = 0.0
    for other in values[1:]:
        assert len(reference) == len(other), "Common rigid motion changed native channel count"
        difference = max(
            difference,
            max(
                abs(a - b)
                for left, right in zip(signature(reference), signature(other), strict=True)
                for a, b in zip(left, right, strict=True)
            ),
        )
    assert difference < 0.02
    assert all(error <= math.sqrt(3) * 0.0005 + 1e-9 for error in errors)
    return reference, {
        "raw_global_frame_path_counts": [len(raw), len(raw_moved)],
        "canonical_path_counts": [len(rows) for rows in values],
        "common_rigid_motion_max_difference_angstrom": difference,
        "native_coordinates_identical_after_common_rigid_motion": True,
        "computational_frame": frame,
        "maximum_export_rounding_error_angstrom": max(errors),
        "original_source_preserved": True,
    }
