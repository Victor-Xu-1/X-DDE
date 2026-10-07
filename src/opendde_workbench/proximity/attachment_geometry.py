"""Measured region-boundary bond directions; never growth or clearance predictions."""

import math
from typing import Literal, Self

from pydantic import Field, model_validator

from .result_models import EvidenceModel


class AttachmentBond(EvidenceModel):
    id: str = Field(pattern=r"^[ab]-\d+-\d+$")
    region: Literal["a", "b"]
    region_atom: int = Field(ge=0, le=4999)
    outside_atom: int = Field(ge=0, le=4999)
    region_element: str = Field(pattern=r"^[A-Z][a-z]?$")
    outside_element: str = Field(pattern=r"^[A-Z][a-z]?$")
    origin: tuple[float, float, float]
    target: tuple[float, float, float]
    bond_length_angstrom: float = Field(ge=0)
    direction: tuple[float, float, float] | None

    @model_validator(mode="after")
    def measured(self) -> Self:
        distance = math.dist(self.origin, self.target)
        if (
            self.region_atom == self.outside_atom
            or abs(distance - self.bond_length_angstrom) > 0.000001
        ):
            raise ValueError("A boundary bond must retain its actual distinct atoms and distance.")
        if (self.direction is None) != (distance <= 0.000001):
            raise ValueError("Coincident atoms have no measured bond direction.")
        if self.direction is not None:
            expected = tuple(
                (b - a) / distance for a, b in zip(self.origin, self.target, strict=True)
            )
            if max(abs(a - b) for a, b in zip(self.direction, expected, strict=True)) > 0.000001:
                raise ValueError("A boundary direction must come from its actual bond coordinates.")
        return self


def boundary_bonds(graph, source_indices, arm_maps, coordinates):
    """Use exact whole-graph source identities and the supplied pose's real bonds."""
    count = len(graph["atoms"])
    if (
        len(source_indices) != count
        or len(set(source_indices)) != count
        or len(coordinates) != count
        or len(arm_maps) != 2
        or any(len(point) != 3 or not all(math.isfinite(n) for n in point) for point in coordinates)
    ):
        raise ValueError(
            "Boundary geometry needs the complete finite molecular pose and exact atom map."
        )
    inverse = {index: local for local, index in enumerate(source_indices)}
    if any(not set(mapping) <= inverse.keys() for mapping in arm_maps) or set(arm_maps[0]) & set(
        arm_maps[1]
    ):
        raise ValueError("Binding regions must retain distinct confirmed whole-molecule atoms.")
    rows = []
    for region, mapping in zip(("a", "b"), arm_maps, strict=True):
        inside = {inverse[index] for index in mapping}
        for first, second, order in graph["bonds"]:
            if not 0 <= first < count or not 0 <= second < count or first == second:
                raise ValueError("Boundary evidence contains an invalid molecular bond.")
            if (first in inside) == (second in inside):
                continue
            if order != 1:
                raise ValueError("Choose a region boundary across an ordinary single bond.")
            left, right = (first, second) if first in inside else (second, first)
            origin, target = coordinates[left], coordinates[right]
            distance = math.dist(origin, target)
            rows.append(
                AttachmentBond(
                    id=f"{region}-{source_indices[left]}-{source_indices[right]}",
                    region=region,
                    region_atom=source_indices[left],
                    outside_atom=source_indices[right],
                    region_element=graph["atoms"][left].split()[0],
                    outside_element=graph["atoms"][right].split()[0],
                    origin=origin,
                    target=target,
                    bond_length_angstrom=distance,
                    direction=None
                    if distance <= 0.000001
                    else tuple((b - a) / distance for a, b in zip(origin, target, strict=True)),
                ).model_dump(mode="json")
            )
    if len(rows) > 512 or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Boundary evidence exceeds its explicit unique-bond budget.")
    return rows
