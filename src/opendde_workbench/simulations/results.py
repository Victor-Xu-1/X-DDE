"""Finite, typed, coordinate-bound simulation results, distinct from scientific acceptance."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Artifact = str


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DynamicsFrame(Evidence):
    artifact: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    time_ns: float = Field(gt=0, le=500)
    backbone_rmsd_angstrom: float = Field(ge=0)
    ligand_rmsd_angstrom: float | None = Field(default=None, ge=0)
    radius_gyration_angstrom: float = Field(ge=0)
    potential_kj_mol: float


class Residue(Evidence):
    chain: str = Field(max_length=8)
    number: str = Field(max_length=8)
    insertion: str = Field(max_length=2)
    name: str = Field(max_length=8)


class Fluctuation(Residue):
    rmsf_angstrom: float = Field(ge=0)


class Contact(Residue):
    occupancy: float = Field(ge=0, le=1)


class DynamicsRepeat(Evidence):
    repeat: int = Field(ge=1, le=3)
    seed: int = Field(ge=1, le=2147483647)
    trajectory: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    checkpoint: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    frames: list[DynamicsFrame] = Field(min_length=2, max_length=200)
    residues: list[Fluctuation] = Field(min_length=1, max_length=5000)
    contacts: list[Contact] = Field(default_factory=list, max_length=5000)


class DynamicsResult(Evidence):
    method: str = Field(max_length=200)
    reference: str = Field(max_length=200)
    contact_definition: str = Field(max_length=200)
    replicas: list[DynamicsRepeat] = Field(min_length=1, max_length=3)


class FreeEnergyNode(Evidence):
    id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    record: int = Field(ge=0, le=99999)
    artifact: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,160}$")
    smiles: str = Field(min_length=1, max_length=5000)


class IndividualEstimate(Evidence):
    delta_g: float
    mbar_error: float = Field(ge=0)


class Convergence(Evidence):
    fractions: list[float] = Field(min_length=2, max_length=100)
    forward: list[float] = Field(min_length=2, max_length=100)
    reverse: list[float] = Field(min_length=2, max_length=100)
    forward_error: list[float] = Field(min_length=2, max_length=100)
    reverse_error: list[float] = Field(min_length=2, max_length=100)


class LegResult(Evidence):
    delta_g_kcal_mol: float
    uncertainty_kcal_mol: float = Field(ge=0)
    repeat_spread_kcal_mol: float | None = Field(default=None, ge=0)
    individual: list[IndividualEstimate] = Field(min_length=1, max_length=6)
    overlap: list[list[list[float]]] = Field(min_length=1, max_length=6)
    convergence: list[Convergence | None] = Field(min_length=1, max_length=6)


class FreeEnergyEdge(Evidence):
    id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    a: str = Field(max_length=80)
    b: str = Field(max_length=80)
    mapping_score: float = Field(ge=0, le=1)
    atom_map: list[tuple[int, int]] = Field(min_length=1, max_length=500)
    delta_delta_g_kcal_mol: float | None = None
    uncertainty_kcal_mol: float | None = Field(default=None, ge=0)
    minimum_adjacent_overlap: float | None = Field(default=None, ge=0, le=1)
    quality: Literal["review_required", "diagnostics_available"] | None = None
    legs: dict[Literal["complex", "solvent"], LegResult] | None = None


class FreeEnergyResult(Evidence):
    stage: Literal["plan", "calculate"]
    method: str = Field(max_length=200)
    unit: Literal["kcal/mol"]
    direction: str = Field(max_length=200)
    acceptance: Literal["not_scientifically_accepted"]
    nodes: list[FreeEnergyNode] = Field(min_length=2, max_length=12)
    edges: list[FreeEnergyEdge] = Field(min_length=1, max_length=66)


def validate_simulation(result, request):
    if request.operation in {"molecular_dynamics", "gromacs_dynamics"}:
        evidence = result.dynamics
        if evidence is None or len(evidence.replicas) != request.payload.repeats:
            raise ValueError("Dynamics lacks its declared independent repeats.")
        files = set()
        for index, repeat in enumerate(evidence.replicas):
            if repeat.repeat != index + 1 or len(repeat.frames) != request.payload.frames:
                raise ValueError(
                    "Dynamics repeat/frame identities differ from the requested sampling."
                )
            times = [frame.time_ns for frame in repeat.frames]
            if times != sorted(set(times)) or abs(times[-1] - request.payload.production_ns) > 1e-5:
                raise ValueError("Dynamics time coordinates do not cover the declared production.")
            files.update(
                {repeat.trajectory, repeat.checkpoint, *(f.artifact for f in repeat.frames)}
            )
        if not files <= result.artifact_sha256.keys():
            raise ValueError("Dynamics trajectories and snapshots need verified byte identities.")
    elif result.dynamics is not None:
        raise ValueError("Dynamics evidence belongs only to a dynamics task.")
    if request.operation == "binding_free_energy":
        evidence = result.free_energy
        if evidence is None or evidence.stage != request.payload.stage:
            raise ValueError("FEP evidence differs from the requested calculation stage.")
        if [n.record for n in evidence.nodes] != request.payload.records:
            raise ValueError("FEP molecule identities differ from the selected original records.")
        nodes = {node.id for node in evidence.nodes}
        if (
            len(nodes) != len(evidence.nodes)
            or not {n.artifact for n in evidence.nodes} <= result.artifact_sha256.keys()
        ):
            raise ValueError("FEP requires unique verified molecular nodes.")
        for edge in evidence.edges:
            if edge.a not in nodes or edge.b not in nodes or edge.a == edge.b:
                raise ValueError("FEP edge refers to absent molecular nodes.")
            if evidence.stage == "plan":
                if edge.legs is not None or edge.delta_delta_g_kcal_mol is not None:
                    raise ValueError(
                        "A planned network cannot claim calculated binding free energies."
                    )
            else:
                if (
                    edge.legs is None
                    or set(edge.legs) != {"complex", "solvent"}
                    or edge.uncertainty_kcal_mol is None
                ):
                    raise ValueError(
                        "FEP needs both thermodynamic legs and a statistical uncertainty."
                    )
                delta = (
                    edge.legs["complex"].delta_g_kcal_mol - edge.legs["solvent"].delta_g_kcal_mol
                )
                if (
                    edge.delta_delta_g_kcal_mol is None
                    or abs(delta - edge.delta_delta_g_kcal_mol) > 1e-8
                ):
                    raise ValueError("FEP direction differs from complex minus solvent.")
                for leg in edge.legs.values():
                    if len(leg.individual) != request.payload.repeats:
                        raise ValueError("FEP repeat evidence is incomplete.")
                    for matrix in leg.overlap:
                        windows = request.payload.lambda_windows
                        if len(matrix) != windows or any(
                            len(row) != windows or any(not 0 <= v <= 1 for v in row)
                            for row in matrix
                        ):
                            raise ValueError(
                                "FEP overlap matrix differs from native lambda states."
                            )
                    for series in leg.convergence:
                        if (
                            series is not None
                            and len(
                                {
                                    len(series.fractions),
                                    len(series.forward),
                                    len(series.reverse),
                                    len(series.forward_error),
                                    len(series.reverse_error),
                                }
                            )
                            != 1
                        ):
                            raise ValueError("FEP convergence axes do not match.")
    elif result.free_energy is not None:
        raise ValueError("Free-energy evidence belongs only to its FEP task.")
