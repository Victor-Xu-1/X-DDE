"""All official engine operations use the same persisted task envelope."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Discriminator,
    Field,
    Tag,
    TypeAdapter,
    field_validator,
    model_validator,
)

from .diffsbdd.contract import DiffTask, references
from .docking.contract import DockingTask
from .docking.contract import references as docking_references
from .harness_contract import HarnessTask
from .pockets.contract import PocketSearch
from .prediction import Prediction
from .task_metadata import TaskMetadata


class Preparation(Prediction):
    operation: Literal["msa", "mt", "prep"]

    @model_validator(mode="after")
    def validate_preparation(self) -> Self:
        if self.parameters.feature_mode == "none":
            raise ValueError("Choose uploaded features or explicitly enable feature search.")
        if self.operation == "mt" and not self.parameters.use_template:
            raise ValueError("Template preparation requires template features enabled.")
        if self.operation == "prep" and not (
            self.parameters.use_template and self.parameters.use_rna_msa
        ):
            raise ValueError(
                "The native prep command prepares protein, template and RNA features together."
            )
        if self.operation in {"msa", "mt"} and not any(
            c.kind == "protein" for c in self.components
        ):
            raise ValueError("Protein MSA/template operations require a protein component.")
        if self.operation == "prep" and not any(
            c.kind in {"protein", "rna"} for c in self.components
        ):
            raise ValueError("Feature preparation requires a protein or RNA sequence.")
        return self


class Inspection(Prediction):
    operation: Literal["inspect"] = "inspect"


class UtilityRequest(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    project_id: UUID | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip() or any(ord(c) < 32 for c in value):
            raise ValueError("Task name must contain visible text.")
        return value.strip()


class Conversion(UtilityRequest):
    operation: Literal["json"] = "json"
    assets: list[UUID] = Field(min_length=1, max_length=20)
    altloc: str = Field(default="first", pattern=r"^(first|[A-Za-z0-9])$")
    assembly_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,24}$")
    include_discont_poly_poly_bonds: bool = False


class Diagnostic(UtilityRequest):
    operation: Literal["doctor"] = "doctor"


class Properties(UtilityRequest):
    operation: Literal["properties"] = "properties"
    smiles: list[str] = Field(default_factory=list, max_length=500)
    ligand_files: list[UUID] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def has_molecules(self) -> Self:
        if not self.smiles and not self.ligand_files:
            raise ValueError("Provide SMILES or a molecule file.")
        if any(
            not s.strip() or len(s) > 5000 or any(c.isspace() for c in s.strip())
            for s in self.smiles
        ):
            raise ValueError("Provide one nonempty SMILES per line, at most5000 characters each.")
        self.smiles = [s.strip() for s in self.smiles]
        return self


class ResourceTask(UtilityRequest):
    operation: Literal["resources"] = "resources"
    targets: list[Literal["standard", "abag", "common", "search"]] = Field(
        min_length=1, max_length=4
    )
    allow_network: bool = False

    @model_validator(mode="after")
    def consent(self) -> Self:
        if not self.allow_network:
            raise ValueError("Resource downloads require explicit network permission.")
        if len(set(self.targets)) != len(self.targets):
            raise ValueError("Select each resource at most once.")
        return self


def request_kind(value: object) -> str:
    operation = (
        value.get("operation", "predict")
        if isinstance(value, dict)
        else getattr(value, "operation", "predict")
    )
    return "features" if operation in {"msa", "mt", "prep"} else str(operation)


TaskRequest = Annotated[
    Annotated[Prediction, Tag("predict")]
    | Annotated[Preparation, Tag("features")]
    | Annotated[Inspection, Tag("inspect")]
    | Annotated[Conversion, Tag("json")]
    | Annotated[Diagnostic, Tag("doctor")]
    | Annotated[ResourceTask, Tag("resources")]
    | Annotated[Properties, Tag("properties")]
    | Annotated[HarnessTask, Tag("harness")]
    | Annotated[DiffTask, Tag("diffsbdd")]
    | Annotated[PocketSearch, Tag("pocket_search")]
    | Annotated[DockingTask, Tag("docking")],
    Discriminator(request_kind),
]
TASK_ADAPTER = TypeAdapter(TaskRequest)


def input_identifiers(request: TaskRequest) -> set[str]:
    from .harness_contract import asset_references

    if isinstance(request, DockingTask):
        return {str(ref.asset_id) for _, ref in docking_references(request)} | {
            str(ref.asset_id) for ref in request.scientific_inputs
        }
    if isinstance(request, PocketSearch):
        return {str(request.protein.asset_id)} | {
            str(ref.asset_id) for ref in request.scientific_inputs
        }
    if isinstance(request, DiffTask):
        return {str(ref.asset_id) for _, ref in references(request)} | {
            str(ref.asset_id) for ref in request.scientific_inputs
        }

    identifiers = {
        str(value)
        for value in getattr(request, "assets", []) + getattr(request, "ligand_files", [])
    }
    for component in getattr(request, "components", []):
        for name in ("ligand_file", "unpaired_msa", "paired_msa", "template_hits"):
            value = getattr(component, name, None)
            if value:
                identifiers.add(str(value))
    identifiers.update(
        identifier for _, identifier in asset_references(getattr(request, "payload", {}))
    )
    identifiers.update(str(ref.asset_id) for ref in request.scientific_inputs)
    return identifiers


class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tasks: list[Prediction] = Field(min_length=1, max_length=20)
