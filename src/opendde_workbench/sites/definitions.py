"""Defined sites retain search conditions without inventing native pocket predictions."""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..docking.contract import ReferenceSearch, Search
from ..scientific_objects import MoleculeRef, ScientificModel


class DefinedRegion(ScientificModel):
    label: str = Field(min_length=1, max_length=80, pattern=r"^[^\x00-\x1f\x7f]+$")
    member_index: int = Field(strict=True, ge=0, le=15)
    search: Search

    @model_validator(mode="after")
    def exact_inputs(self):
        if not self.label.strip():
            raise ValueError("Give the defined search region a visible label.")
        frame = self.search.frame
        if not frame.version_id or frame.record or frame.conformer:
            raise ValueError("A defined region needs one exact saved aligned receptor version.")
        if isinstance(self.search, ReferenceSearch):
            reference = self.search.reference
            if not reference.version_id or reference.conformer:
                raise ValueError("A reference pocket needs an exact saved SDF record.")
        return self


class DefinedSiteInput(ScientificModel):
    kind: Literal["defined_regions"]
    name: str = Field(
        default="Defined search regions",
        min_length=1,
        max_length=120,
        pattern=r"^[^\x00-\x1f\x7f]+$",
    )
    ensemble_id: UUID
    regions: tuple[DefinedRegion, ...] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def distinct_regions(self):
        if not self.name.strip():
            raise ValueError("Give the defined site collection a visible name.")
        identities = {(row.member_index, row.search.model_dump_json()) for row in self.regions}
        if len(identities) != len(self.regions):
            raise ValueError("Select each exact member/search condition only once.")
        return self


class DefinedSite(ScientificModel):
    id: str = Field(pattern=r"^m[0-9]{2}-r[0-9]{1,2}$")
    member_index: int = Field(strict=True, ge=0, le=15)
    protein: MoleculeRef
    label: str = Field(min_length=1, max_length=80)
    search: Search


class DefinedSiteSet(ScientificModel):
    schema_version: Literal[2] = 2
    id: UUID
    request: DefinedSiteInput
    reference: MoleculeRef
    alignment_job: UUID
    sites: tuple[DefinedSite, ...] = Field(min_length=1, max_length=12)
    coordinate_frame: Literal["selected_reference_structure"] = "selected_reference_structure"
    method: Literal["explicit_search_conditions_v1"] = "explicit_search_conditions_v1"
    scientific_scope: Literal["defined_search_conditions_not_predicted_or_observed_binding"] = (
        "defined_search_conditions_not_predicted_or_observed_binding"
    )
    created_at: str

    @model_validator(mode="after")
    def exact_definitions(self):
        if len(self.sites) != len(self.request.regions):
            raise ValueError("Saved site definitions differ from the selected search conditions.")
        for index, (site, region) in enumerate(zip(self.sites, self.request.regions, strict=True)):
            if (
                site.id != f"m{region.member_index:02}-r{index + 1}"
                or site.member_index != region.member_index
                or site.protein != region.search.frame
                or site.search != region.search
                or site.label != region.label
            ):
                raise ValueError("A saved defined site changed its member, label or search frame.")
        return self
