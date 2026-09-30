"""Bounded native CSV parsing retains every site as a hypothesis, never an affinity."""

import csv
import re

from ..scientific_objects import ResidueRef


def rows(file):
    if file.is_symlink() or file.stat().st_size > 25 * 1024**2:
        raise ValueError("Pocket report is unavailable or exceeds its size limit.")
    with file.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, skipinitialspace=True)
        if not reader.fieldnames:
            raise ValueError("Pocket CSV has no header.")
        for index, row in enumerate(reader):
            if index >= 100000:
                raise ValueError("Pocket CSV exceeds its row limit.")
            yield {str(k).strip().lower(): str(v).strip() for k, v in row.items() if k is not None}


def parse(predictions, residues, protein, limit):
    from pydantic import BaseModel, ConfigDict, Field

    class Site(BaseModel):
        model_config = ConfigDict(extra="forbid")
        rank: int = Field(ge=1, le=100000)
        score: float = Field(ge=0, allow_inf_nan=False)
        probability: float = Field(ge=0, le=1, allow_inf_nan=False)
        center_x: float = Field(allow_inf_nan=False)
        center_y: float = Field(allow_inf_nan=False)
        center_z: float = Field(allow_inf_nan=False)

    sites = []
    for row in rows(predictions):
        value = Site.model_validate({key: row[key] for key in Site.model_fields})
        sites.append(
            {**value.model_dump(), "name": row.get("name", f"pocket{value.rank}"), "residues": []}
        )
    if len({site["rank"] for site in sites}) != len(sites):
        raise ValueError("Pocket ranks must be unique.")
    lookup = {site["rank"]: site for site in sites}
    for row in rows(residues):
        rank = int(row["pocket"])
        if not rank or rank not in lookup:
            continue
        chain, label = row["chain"], row["residue_label"]
        match = re.fullmatch(r"(-?\d+)([A-Za-z]?)", label)
        if not match:
            raise ValueError("Native residue identity cannot be represented without ambiguity.")
        ref = ResidueRef(
            structure=protein, chain=chain, number=int(match[1]), insertion_code=match[2]
        )
        lookup[rank]["residues"].append(ref.model_dump(mode="json"))
    sites.sort(key=lambda site: site["rank"])
    return {
        "pockets": sites[:limit],
        "native_pocket_count": len(sites),
        "truncated": len(sites) > limit,
        "source_format": "native_p2rank_csv",
    }
