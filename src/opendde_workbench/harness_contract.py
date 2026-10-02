"""Platform task envelope around the shared native scientific tool contracts."""

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from .harness_tools import (
    BLOCKED_FIELDS as BLOCKED_FIELDS,
)
from .harness_tools import (
    FILE_FIELDS as FILE_FIELDS,
)
from .harness_tools import (
    LOCAL_MODELS as LOCAL_MODELS,
)
from .harness_tools import (
    TOOLS as TOOLS,
)
from .harness_tools import (
    PopulationComparison as PopulationComparison,
)
from .harness_tools import (
    PoseComparison as PoseComparison,
)
from .harness_tools import (
    asset_references as asset_references,
)
from .harness_tools import (
    validate_identifier as validate_identifier,
)
from .harness_tools import (
    validate_payload as validate_payload,
)
from .task_metadata import TaskMetadata


class HarnessTask(TaskMetadata):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["harness"] = "harness"
    name: str = Field(min_length=1, max_length=80)
    project_id: UUID | None = None
    tool: Literal[
        "esm",
        "esm2",
        "mpnn",
        "fold",
        "target-msa",
        "epitope",
        "structure",
        "evolution",
        "protrek-sequence",
        "protrek-structure",
        "rmsd",
        "compare",
    ]
    payload: dict = Field(default_factory=dict)
    allow_external: bool = False

    @model_validator(mode="after")
    def valid_tool(self):
        validate_payload(self.payload)
        if (
            self.tool in {"target-msa", "protrek-sequence", "protrek-structure", "fold"}
            and not self.allow_external
        ):
            raise ValueError(
                "This operation sends data to a configured external service. Enable it explicitly."
            )
        return self
