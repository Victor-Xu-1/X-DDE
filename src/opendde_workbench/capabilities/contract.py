"""Public capability metadata; runtime configuration is not scientific acceptance."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .modalities import ModalityId


class ConstraintSupport(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: str
    support: Literal["native", "adapter", "result_check", "unsupported"]
    phase: Literal["input", "sampling", "refinement", "result"]


class CapabilitySpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=r"^[a-z][a-z0-9_.-]{0,63}$")
    group: Literal["design", "structure", "evaluate", "analyze", "search", "prepare", "system"]
    modalities: tuple[ModalityId, ...] = Field(min_length=1)
    modality_role: Literal["research_object", "target_context", "shared"]
    environment: Literal[
        "opendde",
        "harness",
        "diffsbdd",
        "platform",
        "p2rank",
        "gnina",
        "chemistry",
        "biopython",
        "discovery",
        "anarcii",
        "posebusters",
        "admet",
        "sapiens",
    ]
    operations: tuple[str, ...]
    label: tuple[str, str]
    note: tuple[str, str]
    source: str
    frontend_form: str | None = None
    native_tool: str | None = None
    native_mode: str | None = None
    submission: Literal["task", "native_campaign", "research_plan", "scientific_record"] = "task"
    contract_source: str = "TaskRequest"
    constraint_support: tuple[ConstraintSupport, ...] = ()
    scientific_validation: Literal["target_server_pending", "not_applicable"] = (
        "target_server_pending"
    )


class CapabilityAvailability(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    configuration_present: bool
    checks: dict[str, bool]
    missing: tuple[str, ...]
    request_specific_checks: tuple[str, ...] = ()
    check_scope: Literal["configuration_only"] = "configuration_only"
    requires_native_preflight: Literal[True] = True
    scientific_validation: Literal["target_server_pending", "not_applicable"] = (
        "target_server_pending"
    )
