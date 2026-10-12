"""Descriptor output admission after the actual bounded native process finishes."""

import math
import re


def validate_properties(value, request, output):
    rows = value.get("molecules")
    if value.get("operation") != "properties" or value.get("complete") is not True or (
        not isinstance(rows, list) or not 1 <= len(rows) <= 500
    ):
        raise ValueError("Native descriptors lack a complete molecular record set.")
    files = {str(identifier) for identifier in request.ligand_files}
    for row in rows:
        if not isinstance(row, dict) or type(row.get("available")) is not bool:
            raise ValueError("Native descriptor availability is invalid.")
        source = row.get("input")
        match = re.fullmatch(r"([0-9a-f-]{36}):([1-9]\d*)", str(source))
        if source not in request.smiles and (not match or match[1] not in files):
            raise ValueError("The descriptor record belongs to a different molecular input.")
        if not row["available"]:
            if not isinstance(row.get("reason"), str) or not row["reason"].strip():
                raise ValueError("An invalid molecular record must retain its failure reason.")
            continue
        for key in ("mw", "logp", "tpsa", "qed", "sa", "hbd", "hba", "rotatable_bonds"):
            number = row.get(key)
            if type(number) not in {int, float} or not math.isfinite(number):
                raise ValueError("A native descriptor is missing or non-finite.")
        if not isinstance(row.get("smiles"), str) or not row["smiles"]:
            raise ValueError("A native descriptor must retain its chemical identity.")
    csv = output / "properties.csv"
    if csv.is_symlink() or not csv.is_file() or not 0 < csv.stat().st_size <= 8 * 1024**2:
        raise ValueError("The native descriptor spreadsheet is missing or unsafe.")
