"""Native assembly evidence with explicit scientific scope and no aggregate activity score."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..scientific_objects import MoleculeRef


class EvidenceModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SourceAtom(EvidenceModel):
    position: tuple[float, float, float]
    chain: str = Field(min_length=1, max_length=8)
    number: int = Field(ge=-9999, le=99999)
    insertion: str = Field(max_length=1)
    residue: str = Field(min_length=1, max_length=4)
    atom: str = Field(min_length=1, max_length=4)
    element: str = Field(pattern=r"^[A-Z][a-z]?$")


class PartnerMapping(EvidenceModel):
    output_chain: Literal["A", "B"]
    source: MoleculeRef
    atoms: list[SourceAtom] = Field(min_length=90, max_length=30000)


class RigidTransform(EvidenceModel):
    convention: Literal["output_equals_rotation_times_source_column_plus_translation"]
    rotation: tuple[
        tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]
    ]
    translation: tuple[float, float, float]

    @model_validator(mode="after")
    def proper(self) -> Self:
        r = self.rotation
        for i in range(3):
            for j in range(3):
                if abs(sum(r[k][i] * r[k][j] for k in range(3)) - int(i == j)) > 0.0001:
                    raise ValueError("Partner output must have one proper rigid rotation.")
        determinant = (
            r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1])
            - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
            + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0])
        )
        if abs(determinant - 1) > 0.0001:
            raise ValueError("Partner output cannot contain a reflection.")
        return self


class ArmQuality(EvidenceModel):
    rmsd_from_binary_angstrom: float | None = Field(ge=0)
    contacting_heavy_atoms: int = Field(ge=0, le=256)


class RelaxationQuality(EvidenceModel):
    status: Literal[
        "converged", "not_converged", "unsupported_parameters", "not_evaluated_invalid_geometry"
    ]
    difference_kcal_mol: float | None = Field(ge=0)


class BondViolation(EvidenceModel):
    a: int = Field(ge=0, le=255)
    b: int = Field(ge=0, le=255)
    length_angstrom: float = Field(ge=0)


class AssemblyQuality(EvidenceModel):
    accepted: bool
    bond_violations: list[BondViolation] = Field(max_length=1024)
    intramolecular_severe_pairs: int = Field(ge=0)
    ligand_partner_a_severe_pairs: int = Field(ge=0)
    ligand_partner_b_severe_pairs: int = Field(ge=0)
    partner_partner_severe_pairs: int = Field(ge=0)
    stereochemistry_preserved: bool
    arms: tuple[ArmQuality, ArmQuality]
    relaxation: RelaxationQuality
    method: Literal["X-DDE independent covalent-radius/steric/binary-frame/stereo checks v1"]
    scope: Literal["basic_geometry_not_experimental_activity_or_complete_posebusters_acceptance"]

    @model_validator(mode="after")
    def acceptance(self) -> Self:
        expected = (
            not (
                self.bond_violations
                or self.intramolecular_severe_pairs
                or self.ligand_partner_a_severe_pairs
                or self.ligand_partner_b_severe_pairs
                or self.partner_partner_severe_pairs
            )
            and self.stereochemistry_preserved
            and all(
                arm.contacting_heavy_atoms >= 3
                and (arm.rmsd_from_binary_angstrom is None or arm.rmsd_from_binary_angstrom <= 3)
                for arm in self.arms
            )
        )
        if self.accepted != expected:
            raise ValueError("Assembly status disagrees with its independent geometry evidence.")
        if (self.relaxation.difference_kcal_mol is not None) != (
            self.relaxation.status == "converged"
        ):
            raise ValueError("Relaxation difference requires actual supported convergence.")
        return self


class AssemblyProposal(EvidenceModel):
    id: str = Field(pattern=r"^assembly-\d{3}$")
    seed: int = Field(ge=0, le=2147483646)
    complex_artifact: str = Field(pattern=r"^assembly-\d{3}\.pdb$")
    ligand_artifact: str = Field(pattern=r"^assembly-\d{3}-ligand\.sdf$")
    partner_artifacts: tuple[str, str]
    partner_b_transform: RigidTransform
    ranking_surrogate: float | None
    quality: AssemblyQuality


class SearchFailure(EvidenceModel):
    seed: int = Field(ge=0, le=2147483646)
    reason: str = Field(min_length=1, max_length=300)


class TernarySearch(EvidenceModel):
    attempted: int = Field(ge=0, le=60)
    requested: Literal[3, 10, 20]
    attempt_budget: int = Field(ge=3, le=60)
    returned: int = Field(ge=0, le=20)
    status: Literal["requested_samples", "attempt_budget", "time_budget"]
    seconds: float = Field(ge=0)
    failures: list[SearchFailure] = Field(max_length=60)


class ChemicalGraph(EvidenceModel):
    atoms: list[str] = Field(min_length=3, max_length=256)
    bonds: list[tuple[int, int, int]] = Field(min_length=1, max_length=1024)
    annotations: list[str] = Field(max_length=64)

    @model_validator(mode="after")
    def valid_graph(self) -> Self:
        count = len(self.atoms)
        if any(len(token) != 8 for token in self.atoms):
            raise ValueError("Original atom element/charge/isotope tokens must be retained.")
        if any(not (0 <= a < b < count and 1 <= order <= 4) for a, b, order in self.bonds):
            raise ValueError("The confirmed whole-molecule bond graph is invalid.")
        if len({(a, b) for a, b, _ in self.bonds}) != len(self.bonds):
            raise ValueError("The confirmed whole-molecule graph has duplicate bonds.")
        if any(
            len(line) > 256 or not line.startswith(("M  CHG", "M  ISO", "M  RAD"))
            for line in self.annotations
        ):
            raise ValueError("Original charge/isotope/radical annotations must be bounded.")
        return self


class TernaryResult(EvidenceModel):
    mechanism: Literal["protac", "riptac", "proximity", "molecular_glue"]
    source_ligand: MoleculeRef
    source_smiles: str = Field(min_length=1, max_length=20000)
    chemical_graph: ChemicalGraph
    ligand_atom_indices: list[int] = Field(min_length=3, max_length=256)
    partner_mapping: tuple[PartnerMapping, PartnerMapping]
    arm_maps: list[list[int]] = Field(max_length=2)
    assemblies: list[AssemblyProposal] = Field(max_length=20)
    search: TernarySearch
    versions: dict[str, str] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def coherent(self) -> Self:
        search = self.search
        if not len(self.assemblies) == search.returned <= search.attempted <= search.attempt_budget:
            raise ValueError("Ternary search counts differ from the actual native ensemble.")
        if (search.status == "requested_samples") != (search.returned == search.requested):
            raise ValueError("A partial search cannot claim the requested complete ensemble.")
        if len({row.id for row in self.assemblies}) != len(self.assemblies):
            raise ValueError("Assembly identities must be unique.")
        if len(set(self.ligand_atom_indices)) != len(self.ligand_atom_indices):
            raise ValueError("Ligand atoms lost their original correspondence.")
        if len(self.chemical_graph.atoms) != len(self.ligand_atom_indices):
            raise ValueError("The complete chemical graph lost its original atom correspondence.")
        if [partner.output_chain for partner in self.partner_mapping] != ["A", "B"]:
            raise ValueError("Both declared partner identities are required.")
        if len(self.arm_maps) != (0 if self.mechanism == "molecular_glue" else 2):
            raise ValueError("Arm mappings differ from the selected research mechanism.")
        return self
