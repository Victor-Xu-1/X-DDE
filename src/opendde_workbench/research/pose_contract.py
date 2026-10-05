"""Preview actions use immutable platform sources, never browser-provided filesystem paths."""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from ..scientific_objects import ScientificModel


class AssetPoseSource(ScientificModel):
    kind: Literal["asset"]
    asset_id: UUID
    record: int = Field(default=0, ge=0, le=499, strict=True)


class ArtifactPoseSource(ScientificModel):
    kind: Literal["artifact"]
    job_id: UUID
    name: str = Field(min_length=1, max_length=500, pattern=r"^[^\x00-\x1f\x7f]+$")
    record: int = Field(default=0, ge=0, le=499, strict=True)


class VersionPoseSource(ScientificModel):
    kind: Literal["version"]
    version_id: UUID


PoseSource = Annotated[
    AssetPoseSource | ArtifactPoseSource | VersionPoseSource,
    Field(discriminator="kind"),
]


class PreviewMinimizeInput(ScientificModel):
    source: PoseSource
    method: Literal["MMFF94s", "UFF", "receptor"] = "MMFF94s"
    max_iterations: int = Field(default=1000, ge=1, le=2000, strict=True)
    receptor: PoseSource | None = None
    coordinate_basis: Literal["user_confirmed"] | None = None

    @model_validator(mode="after")
    def context(self) -> Self:
        if self.method == "receptor":
            if self.receptor is None or self.coordinate_basis != "user_confirmed":
                raise ValueError("Confirm the current ligand pose in its displayed receptor frame.")
        elif self.receptor is not None or self.coordinate_basis is not None:
            raise ValueError("Unbound minimization must not silently discard a receptor context.")
        return self
