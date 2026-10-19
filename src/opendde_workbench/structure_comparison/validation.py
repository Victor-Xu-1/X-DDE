"""Verify exact request, native report and download bytes at success and read boundaries."""

import csv
import hashlib
import json
import re
from itertools import zip_longest

from ..artifacts import contained
from .native_reports import DISPLACEMENT_FIELDS, csv_value, displacement_values
from .result import ComparisonResult


def validate_comparison(value, request, output):
    result = ComparisonResult.model_validate(value)
    if (result.reference, result.moving, result.options) != (
        request.reference,
        request.moving,
        request.options,
    ):
        raise ValueError(
            "Comparison result differs from its exact structural input/options snapshot."
        )
    files = result.artifact_sha256
    required = {
        "reference-selected.cif",
        "moving-aligned.cif",
        "native-dockq.json",
        "residue-displacements.csv",
    }
    for side in ("reference", "moving"):
        sources = {name for name in files if name in {side + "-source.pdb", side + "-source.cif"}}
        if len(sources) != 1:
            raise ValueError("Comparison requires one complete original file per input role.")
        name = next(iter(sources))
        if files[name] != getattr(request, side).sha256:
            raise ValueError("Archived source bytes differ from the selected immutable input.")
        required.add(name)
    if set(files) != required:
        raise ValueError(
            "Comparison exports are incomplete or contain undeclared scientific files."
        )
    for name, checksum in files.items():
        file = contained(output, name)
        if (
            not re.fullmatch(r"[a-f0-9]{64}", checksum)
            or not 0 < file.stat().st_size <= 25 * 1024**2
        ):
            raise ValueError("Comparison artifact digest/size is invalid.")
        if hashlib.sha256(file.read_bytes()).hexdigest() != checksum:
            raise ValueError("Comparison artifact bytes changed after native verification.")
    native = json.loads(contained(output, "native-dockq.json").read_text(encoding="utf-8"))
    if native != result.native_quality.model_dump(mode="json"):
        raise ValueError(
            "Downloadable native report differs from the presented interface evidence."
        )
    with contained(output, "residue-displacements.csv").open(
        encoding="utf-8", newline=""
    ) as stream:
        reader = csv.reader(stream)
        if next(reader, None) != list(DISPLACEMENT_FIELDS):
            raise ValueError("Comparison displacement table has an unreviewed column schema.")
        for actual, row in zip_longest(reader, result.geometry.residue_displacements):
            if actual is None or row is None:
                raise ValueError("Displacement table does not cover every evaluated residue once.")
            expected = list(
                map(str, map(csv_value, displacement_values(row.model_dump(mode="json"))))
            )
            # CSV JSON integer-to-float normalization is numeric, never a change in identity.
            if actual[:9] != expected[:9] or len(actual) != len(expected):
                raise ValueError(
                    "Downloaded displacement residue identities differ from the report."
                )
            if any(float(a) != float(b) for a, b in zip(actual[9:], expected[9:], strict=True)):
                raise ValueError(
                    "Downloaded displacement values differ from the full-precision report."
                )
    return result
