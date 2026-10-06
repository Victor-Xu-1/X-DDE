"""Prepare a self-contained DELi definition without external paths or executable configuration."""

import csv
import json
import math
import re
from pathlib import Path

IDENTITY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
LIBRARY_KEYS = {
    "barcode_schema",
    "bb_sets",
    "reactions",
    "dna_barcode_on",
    "scaffold",
    "linker",
    "truncated_linker",
}


def definition(value):
    if (
        set(value) != {"schema_version", "libraries", "building_blocks"}
        or value["schema_version"] != 1
        or not isinstance(value["libraries"], dict)
        or not 1 <= len(value["libraries"]) <= 16
        or not isinstance(value["building_blocks"], dict)
        or not 1 <= len(value["building_blocks"]) <= 128
    ):
        raise ValueError(
            "Import a self-contained X-DDE DEL definition with libraries and building-block tables."
        )
    for identifier, library in value["libraries"].items():
        if (
            not IDENTITY.fullmatch(identifier)
            or not isinstance(library, dict)
            or set(library) - LIBRARY_KEYS
        ):
            raise ValueError(
                "Library definitions contain unknown options or external file references."
            )
        cycles = library.get("bb_sets", [])
        if not 2 <= len(cycles) <= 8:
            raise ValueError("Choose 2–8 explicit building-block cycles.")
        for index, cycle in enumerate(cycles, start=1):
            if (
                set(cycle) != {"cycle", "bb_set_name"}
                or cycle["cycle"] != index
                or cycle["bb_set_name"] not in value["building_blocks"]
            ):
                raise ValueError(
                    "Each DEL cycle must name its supplied exact building-block table."
                )
        if not isinstance(library.get("barcode_schema"), dict):
            raise ValueError("A DEL library needs its native barcode schema.")
        if len(library["barcode_schema"]) > 30:
            raise ValueError("The barcode schema exceeds its supported segment budget.")
        for section in library["barcode_schema"].values():
            if not isinstance(section, dict) or set(section) - {
                "tag",
                "overhang",
                "error_correction",
            }:
                raise ValueError("Barcode segments contain unsupported options.")
            if not re.fullmatch(r"[ACGTN]{1,100}", section.get("tag", "")):
                raise ValueError("Barcode segments must contain explicit DNA bases or N positions.")
            if "overhang" in section and not re.fullmatch(r"[ACGT]{0,50}", section["overhang"]):
                raise ValueError("Barcode overhangs must be explicit DNA sequences.")
        reactions = library.get("reactions", {})
        if not isinstance(reactions, dict) or len(reactions) > 20:
            raise ValueError("The existing DEL enumeration rule budget is exceeded.")
        for step in reactions.values():
            if (
                not isinstance(step, dict)
                or set(step) - {"step_id", "rxn_smarts", "reactants", "ignore_multiple_products"}
                or not isinstance(step.get("rxn_smarts"), str)
                or not 3 <= len(step["rxn_smarts"]) <= 5000
                or not isinstance(step.get("reactants"), list)
                or len(step["reactants"]) > 8
            ):
                raise ValueError(
                    "DEL enumeration uses supplied reaction SMARTS, never external reaction files."
                )
    for identifier, rows in value["building_blocks"].items():
        if (
            not IDENTITY.fullmatch(identifier)
            or not isinstance(rows, list)
            or not 1 <= len(rows) <= 20000
        ):
            raise ValueError("Building-block table identities or sizes are unsupported.")
        tags, members = {}, {}
        for row in rows:
            if not isinstance(row, dict) or set(row) - {"id", "tag", "smiles"}:
                raise ValueError("Building-block rows use id, tag and optional smiles.")
            if not IDENTITY.fullmatch(row.get("id", "")) or not re.fullmatch(
                r"[ACGT]{4,32}", row.get("tag", "")
            ):
                raise ValueError(
                    "Building-block IDs and DNA tags must be unambiguous explicit values."
                )
            smiles = row.get("smiles", "")
            if (
                not isinstance(smiles, str)
                or len(smiles) > 5000
                or any(char in smiles for char in ",\r\n\x00")
            ):
                raise ValueError("The native building-block SMILES field is invalid.")
            if row["tag"] in tags and tags[row["tag"]] != row["id"]:
                raise ValueError("Two building-block identities share the same DNA tag.")
            if row["id"] in members and members[row["id"]] != smiles:
                raise ValueError("One building-block identity has conflicting chemical structures.")
            tags[row["tag"]], members[row["id"]] = row["id"], smiles
    return value


def prepare_home(value):
    from deli.configure import set_deli_data_dir
    from deli.dels.combinatorial import DELibrary

    value = definition(value)
    root = Path("/tmp/xdde-deli-data")
    for folder in ("libraries", "building_blocks", "reactions", "tool_compounds"):
        (root / folder).mkdir(parents=True, exist_ok=True)
    for identifier, rows in value["building_blocks"].items():
        with (root / "building_blocks" / (identifier + ".csv")).open("w", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["id", "tag", "smiles"])
            writer.writerows((row["id"], row["tag"], row.get("smiles", "")) for row in rows)
    for identifier, library in value["libraries"].items():
        (root / "libraries" / (identifier + ".json")).write_text(json.dumps(library))
    set_deli_data_dir(root)
    return {identifier: DELibrary.load(identifier) for identifier in value["libraries"]}


def barcode_review(value, budget=5000000):
    from Levenshtein import hamming
    from rdkit import Chem

    summaries, remaining = [], budget
    for identifier, rows in value["building_blocks"].items():
        tags = sorted({row["tag"] for row in rows})
        if len({len(tag) for tag in tags}) != 1:
            raise ValueError("A DEL cycle's tags must have the same confirmed length.")
        minimum, reviewed, close = None, 0, []
        for index, tag in enumerate(tags):
            for other in tags[index + 1 :]:
                if remaining <= 0:
                    break
                distance = hamming(tag, other)
                minimum = distance if minimum is None else min(minimum, distance)
                reviewed += 1
                remaining -= 1
                if distance < 3 and len(close) < 50:
                    close.append({"tag_a": tag, "tag_b": other, "distance": distance})
            if remaining <= 0:
                break
        chemical = {row["id"]: row.get("smiles", "") for row in rows}
        valid = sum(bool(smiles and Chem.MolFromSmiles(smiles)) for smiles in chemical.values())
        summaries.append(
            {
                "set": identifier,
                "members": len(chemical),
                "barcodes": len(tags),
                "valid_structures": valid,
                "minimum_observed_hamming_distance": minimum,
                "complete_pair_review": reviewed == len(tags) * (len(tags) - 1) // 2,
                "close_tags": close,
                "pair_checks": reviewed,
                "one_error_correction_uniquely_supported": minimum is not None
                and minimum >= 3
                and reviewed == len(tags) * (len(tags) - 1) // 2,
            }
        )
    return summaries


def theoretical_size(library, value):
    return math.prod(
        len({row["id"] for row in value["building_blocks"][cycle["bb_set_name"]]})
        for cycle in library["bb_sets"]
    )
