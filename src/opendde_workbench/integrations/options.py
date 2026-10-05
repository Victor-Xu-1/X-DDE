"""Bounded execution choices shared by the isolated scientific adapters."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ExecutionOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device: Literal["cpu", "cuda"] = "cpu"
    cpu: int = Field(default=2, ge=1, le=16)
    memory_mib: int = Field(default=4096, ge=1024, le=65536)
    seed: int = Field(default=101, ge=0, le=2147483647)


class MolecularComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9]{0,7}$")
    kind: Literal["protein", "rna", "dna", "ligand"]
    value: str = Field(min_length=1, max_length=5000, pattern=r"^[^\s\x00-\x1f\x7f]+$")


class BoltzPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["boltz"] = "boltz"
    components: list[MolecularComponent] = Field(min_length=1, max_length=8)
    samples: int = Field(default=3, ge=1, le=10)
    recycling_steps: int = Field(default=3, ge=1, le=10)
    sampling_steps: int = Field(default=200, ge=20, le=500)
    affinity: bool = False


class ReinventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kind: Literal["reinvent"] = "reinvent"
    mode: Literal["de_novo", "analogues", "r_groups", "linker", "optimize"] = "analogues"
    fragments: list[str] = Field(default_factory=list, max_length=2)
    candidates: int = Field(default=50, ge=1, le=500)
    optimization_steps: int = Field(default=25, ge=5, le=200)
    molecular_weight: tuple[float, float] = (200, 550)
    logp: tuple[float, float] = (0, 5)


class LigandMPNNPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["ligandmpnn"] = "ligandmpnn"
    redesigned_residues: list[str] = Field(min_length=1, max_length=500)
    candidates: int = Field(default=8, ge=1, le=100)
    temperature: float = Field(default=0.1, gt=0, le=1, allow_inf_nan=False)
    pack_sidechains: bool = True


class BoltzGenPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["boltzgen"] = "boltzgen"
    modality: Literal["protein", "peptide", "antibody", "nanobody"] = "protein"
    target_chains: list[str] = Field(min_length=1, max_length=8)
    length: tuple[int, int] = (80, 120)
    candidates: int = Field(default=20, ge=1, le=200)
    retain: int = Field(default=5, ge=1, le=50)
    scaffold_chain: str | None = Field(default=None, pattern=r"^[A-Za-z0-9]$")
    scaffold_residues: list[str] = Field(default_factory=list, max_length=100)


class RefinementPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["openmm"] = "openmm"
    ph: float = Field(default=7.4, ge=2, le=12, allow_inf_nan=False)
    iterations: int = Field(default=500, ge=1, le=5000)
    restrain_backbone: bool = True
    restraint_kj_mol_nm2: float = Field(default=1000, ge=100, le=10000, allow_inf_nan=False)


class ElectrostaticsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["apbs"] = "apbs"
    ph: float = Field(default=7.4, ge=2, le=12, allow_inf_nan=False)
    salt_molar: float = Field(default=0.15, ge=0, le=1, allow_inf_nan=False)
    grid: Literal[65, 97, 129] = 97
    temperature_kelvin: float = Field(default=298.15, ge=273.15, le=330, allow_inf_nan=False)


class ChempropPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["chemprop"] = "chemprop"
    mode: Literal["train", "predict"] = "train"
    activity_property: str = Field(default="pIC50", pattern=r"^[A-Za-z][A-Za-z0-9_ .-]{0,63}$")
    activity_unit: str = Field(default="pIC50", min_length=1, max_length=40)
    epochs: int = Field(default=30, ge=5, le=200)
    model_job: str | None = Field(default=None, pattern=r"^[a-f0-9-]{36}$")
    model_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class InteractionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["plip"] = "plip"
    ligand_chain: str = Field(pattern=r"^[A-Za-z0-9]$")
    ligand_number: int = Field(ge=-9999, le=99999)
