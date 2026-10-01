"""Finite native scores, complete source indices and explicit prediction limitations."""

from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, model_validator

from ..antibodies.result import NumberedResidue
from ..scientific_objects import MoleculeRef, ScientificModel
from .manifest import METADATA_DIGEST, VERSIONS
from .options import HumanizationOptions

Probability = Annotated[FiniteFloat, Field(strict=True, ge=0, le=1)]
ScoreVector = dict[str, Probability]


class PeptideMatch(ScientificModel):
    source_position: int = Field(ge=1, le=192)
    sequence: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]{9}$")
    matched: bool = Field(strict=True)


class SequenceEvaluation(ScientificModel):
    mean_native_residue_probability: Probability
    oas_peptide_fraction: Probability
    matched_peptides: int = Field(ge=0, le=192)
    total_peptides: int = Field(ge=1, le=192)
    peptides: tuple[PeptideMatch, ...] = Field(min_length=1, max_length=192)

    @model_validator(mode="after")
    def counts(self):
        matched = sum(row.matched for row in self.peptides)
        if (
            self.total_peptides != len(self.peptides)
            or self.matched_peptides != matched
            or abs(self.oas_peptide_fraction - matched / len(self.peptides)) > 1e-12
        ):
            raise ValueError("Native peptide fraction and retained individual matches disagree.")
        return self


class Mutation(ScientificModel):
    source_position: int = Field(ge=1, le=200)
    number: int = Field(ge=1, le=128)
    insertion: str = Field(max_length=4, pattern=r"^[A-Za-z]*$")
    before: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]$")
    after: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]$")
    native_probability_gain: Annotated[FiniteFloat, Field(strict=True, gt=0, le=1)]


class Iteration(ScientificModel):
    iteration: int = Field(ge=1, le=4)
    input_sequence: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]{70,200}$")
    native_scores: tuple[ScoreVector, ...] = Field(min_length=70, max_length=200)
    proposal: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]{70,200}$")
    changes: tuple[Mutation, ...] = Field(max_length=20)


class EvaluationRow(ScientificModel):
    record: int = Field(ge=0, le=19)
    source_id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,80}$")
    source_sequence: str = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWYX]{20,2000}$")
    status: Literal["evaluated", "failed"]
    reason: str | None = Field(max_length=500)
    numbering: tuple[NumberedResidue, ...] = Field(max_length=200)
    chain_type: Literal["H", "K", "L"] | None
    numbering_score: FiniteFloat | None
    original_scores: tuple[ScoreVector, ...] | None = Field(default=None, max_length=200)
    original_evaluation: SequenceEvaluation | None
    proposal: str | None = Field(pattern=r"^[ACDEFGHIKLMNPQRSTVWY]{70,200}$")
    proposal_scores: tuple[ScoreVector, ...] | None = Field(default=None, max_length=200)
    proposal_evaluation: SequenceEvaluation | None
    proposal_numbering: tuple[NumberedResidue, ...] = Field(max_length=200)
    proposal_chain_type: Literal["H", "K", "L"] | None
    proposal_numbering_score: FiniteFloat | None
    iterations: tuple[Iteration, ...] = Field(max_length=4)
    artifact: str | None = Field(pattern=r"^humanized-[0-9]{3}\.fasta$")
    artifact_sha256: str | None = Field(pattern=r"^[a-f0-9]{64}$")


class HumanizationResult(ScientificModel):
    operation: Literal["antibody_humanize"]
    schema_version: Literal[1]
    complete: Literal[True]
    source: MoleculeRef
    options: HumanizationOptions
    metadata_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    versions: dict[str, str]
    rows: tuple[EvaluationRow, ...] = Field(min_length=1, max_length=20)
    evaluated_count: int = Field(ge=0, le=20)
    proposal_count: int = Field(ge=0, le=20)
    classification: Literal["complete", "partial", "empty"]
    scheme: Literal["imgt"]
    sapiens_executed: bool
    scope: Literal["sequence_reference_evaluation_and_protected_framework_proposals"]
    clinical_immunogenicity: Literal["not_predicted"]
    binding_retention: Literal["not_established"]
    paired_chain_compatibility: Literal["not_evaluated"]
    vhh_scope: Literal["human_heavy_reference_exploration_only", "conventional_vh_vl"]

    @model_validator(mode="after")
    def identities(self):
        count = sum(row.status == "evaluated" for row in self.rows)
        classification = "complete" if count == len(self.rows) else "partial" if count else "empty"
        vhh = (
            "human_heavy_reference_exploration_only"
            if self.options.format == "vhh_exploratory"
            else "conventional_vh_vl"
        )
        if (
            self.metadata_sha256 != METADATA_DIGEST
            or self.versions != VERSIONS
            or self.evaluated_count != count
            or self.classification != classification
            or self.proposal_count != sum(row.proposal is not None for row in self.rows)
            or self.sapiens_executed != bool(count)
            or self.vhh_scope != vhh
        ):
            raise ValueError("Sequence evaluation runtime, coverage or scope is inconsistent.")
        return self
