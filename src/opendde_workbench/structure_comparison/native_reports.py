"""Bounded source, coordinate, native-report and full-precision displacement downloads."""

import csv
import hashlib
import json
import shutil


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def csv_value(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def write_reports(output, sources, models, inspections, geometry, quality):
    from comparison_export import write_compared_model

    artifacts = {}
    names = ("reference-selected.cif", "moving-aligned.cif")
    for name, model, inspection in zip(names, models, inspections, strict=True):
        artifacts[name] = write_compared_model(
            model, inspection["polymer"]["modified_residues"], output / name
        )
    for label, path in zip(("reference", "moving"), sources, strict=True):
        name = label + "-source" + path.suffix
        shutil.copyfile(path, output / name)
        artifacts[name] = digest(output / name)
    report = output / "native-dockq.json"
    report.write_text(
        json.dumps(quality, ensure_ascii=False, allow_nan=False, indent=2), encoding="utf-8"
    )
    artifacts[report.name] = digest(report)
    table = output / "residue-displacements.csv"
    fields = (
        "role",
        "reference_chain",
        "reference_number",
        "reference_insertion",
        "reference_letter",
        "moving_chain",
        "moving_number",
        "moving_insertion",
        "moving_letter",
        "displacement_angstrom",
        "reference_x",
        "reference_y",
        "reference_z",
        "moving_source_x",
        "moving_source_y",
        "moving_source_z",
        "moving_aligned_x",
        "moving_aligned_y",
        "moving_aligned_z",
    )
    with table.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(fields)
        for row in geometry["residue_displacements"]:
            left, right = row["reference"], row["moving"]
            writer.writerow(
                map(
                    csv_value,
                    [
                        row["role"],
                        left["chain"],
                        left["number"],
                        left["insertion_code"],
                        row["reference_letter"],
                        right["chain"],
                        right["number"],
                        right["insertion_code"],
                        row["moving_letter"],
                        row["displacement_angstrom"],
                        *row["reference_position"],
                        *row["moving_source_position"],
                        *row["moving_aligned_position"],
                    ],
                )
            )
    artifacts[table.name] = digest(table)
    if any(not 0 < (output / name).stat().st_size <= 25 * 1024**2 for name in artifacts):
        raise ValueError("Comparison scientific reports exceed their bounded output contract.")
    return artifacts
