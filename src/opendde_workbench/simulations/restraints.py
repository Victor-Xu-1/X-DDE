"""Version-bound, explicitly harmonic conditions selected from the source structure."""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from ..scientific_objects import MoleculeRef, ScientificModel

Coordinate = Annotated[float, Field(ge=-100000, le=100000, allow_inf_nan=False)]


class RestraintAtom(ScientificModel):
    role: Literal["structure", "ligand"]
    source: MoleculeRef
    chain: str = Field(default="", max_length=8, pattern=r"^[A-Za-z0-9]*$")
    number: int | None = Field(default=None, ge=-999, le=99999)
    insertion: str = Field(default="", max_length=1, pattern=r"^[A-Za-z0-9]*$")
    atom: str = Field(default="", max_length=16, pattern=r"^[A-Za-z0-9'*+\-]*$")
    index: int | None = Field(default=None, ge=0, le=99999)
    position_angstrom: tuple[Coordinate, Coordinate, Coordinate]

    @model_validator(mode="after")
    def exact_identity(self) -> Self:
        if self.role == "structure":
            if self.number is None or not self.atom or self.index is not None:
                raise ValueError("Select a named atom in one exact structure residue.")
        elif (
            self.index is None
            or self.chain
            or self.number is not None
            or self.atom
            or self.insertion
        ):
            raise ValueError("Select an original atom index in the exact ligand record.")
        return self


class HarmonicCondition(ScientificModel):
    force_kj_mol_nm2: float = Field(default=1000, gt=0, le=100000, allow_inf_nan=False)


class PositionRestraint(HarmonicCondition):
    kind: Literal["position"] = "position"
    atom: RestraintAtom


class DistanceRestraint(HarmonicCondition):
    kind: Literal["distance"] = "distance"
    first: RestraintAtom
    second: RestraintAtom
    distance_angstrom: float = Field(gt=0.5, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def different_atoms(self) -> Self:
        if self.first.model_dump(exclude={"position_angstrom"}) == self.second.model_dump(
            exclude={"position_angstrom"}
        ):
            raise ValueError("A distance restraint must connect two different atoms.")
        return self


SimulationRestraint = Annotated[PositionRestraint | DistanceRestraint, Field(discriminator="kind")]


def validate_restraint_sources(task) -> None:
    conditions = getattr(task.payload, "restraints", ())
    sources = {item.role: item.source for item in task.inputs}
    identities = set()
    for condition in conditions:
        atoms = (
            (condition.atom,)
            if condition.kind == "position"
            else (condition.first, condition.second)
        )
        for atom in atoms:
            if sources.get(atom.role) != atom.source:
                raise ValueError("The restrained atom belongs to a different input version.")
        key = (
            condition.kind,
            tuple(sorted(atom.model_dump_json(exclude={"position_angstrom"}) for atom in atoms)),
        )
        if key in identities:
            raise ValueError(
                "Do not apply duplicate or conflicting restraints to the same atom pair."
            )
        identities.add(key)
