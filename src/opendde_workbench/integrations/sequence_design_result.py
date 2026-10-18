"""Typed inverse-folding evidence; native model likelihood is never affinity."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DesignEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DesignResidue(DesignEvidence):
    identity: str = Field(min_length=2, max_length=20)
    amino_acid: str = Field(pattern=r"^[A-Z]$")
    minimum_ligand_distance_A: float | None = Field(default=None, ge=0)


class DesignMutation(DesignEvidence):
    residue: str
    original: str = Field(pattern=r"^[A-Z]$")
    designed: str = Field(pattern=r"^[A-Z]$")


class DesignSample(DesignEvidence):
    candidate_id: str
    first_identical_sample: str
    mutations: list[DesignMutation] = Field(max_length=500)
    overall_likelihood: float = Field(ge=0, le=1)
    ligand_likelihood: float | None = Field(default=None, ge=0, le=1)
    sequence_recovery: float = Field(ge=0, le=1)


class SequenceDesignResult(DesignEvidence):
    original_sequence: str = Field(min_length=1, max_length=10000)
    selected_residues: list[DesignResidue] = Field(min_length=1, max_length=500)
    native_ligand_scored_residues: int = Field(ge=0, le=500)
    native_ligand_score_cutoff_A: float = Field(gt=0, le=100)
    sample_count: int = Field(ge=1, le=100)
    unique_sequence_count: int = Field(ge=1, le=100)
    wild_type_samples: int = Field(ge=0, le=100)
    candidates: list[DesignSample] = Field(min_length=1, max_length=100)
    scope: Literal["conditional_sequence_likelihood_not_binding_probability"]


def validate_sequence_design(result, request):
    evidence = result.sequence_design
    if evidence is None:
        return  # Historical outputs retain their original bytes and interpretation.
    if request.operation != "ligandmpnn_design":
        raise ValueError("Sequence design evidence requires a ligand-aware inverse-folding task.")
    identities = [row.identity for row in evidence.selected_residues]
    if len(set(identities)) != len(identities) or set(identities) != set(
        request.payload.redesigned_residues
    ):
        raise ValueError("Sequence design evidence differs from the exact selected residues.")
    if evidence.sample_count != len(result.candidates) or evidence.sample_count != len(
        evidence.candidates
    ):
        raise ValueError("Sequence design evidence differs from the retained native sample count.")
    expected = {row.id: row.sequence for row in result.candidates}
    if {row.candidate_id for row in evidence.candidates} != set(expected):
        raise ValueError("Sequence design evidence differs from the native candidate identities.")
    if evidence.unique_sequence_count != len(
        set(expected.values())
    ) or evidence.wild_type_samples != sum(
        sequence.replace(":", "") == evidence.original_sequence for sequence in expected.values()
    ):
        raise ValueError(
            "Sequence diversity or wild-type counts differ from the retained sequences."
        )
    for row in evidence.candidates:
        if (
            row.first_identical_sample not in expected
            or expected[row.first_identical_sample] != expected[row.candidate_id]
        ):
            raise ValueError("Duplicate sample mapping differs from the native sequences.")
        if any(item.residue not in identities for item in row.mutations):
            raise ValueError("Mutation evidence includes an unselected residue.")
        if not evidence.native_ligand_scored_residues and row.ligand_likelihood is not None:
            raise ValueError("An empty native ligand mask cannot supply a ligand likelihood.")
