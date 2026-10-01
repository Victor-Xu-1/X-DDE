"""Bounded, immutable research plans; native jobs remain the execution authority."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

from ..requests import TaskRequest


class Binding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    from_step: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,31}$")
    artifact: str | None = Field(default=None, min_length=1, max_length=500)
    result_field: (
        Literal[
            "molecule_artifact",
            "state_artifact",
            "conformer_artifact",
            "protein_artifact",
            "pocket_artifact",
            "structure",
            "pose_artifact",
            "receptor_artifact",
        ]
        | None
    ) = None

    @model_validator(mode="after")
    def output_selector(self) -> Self:
        if bool(self.artifact) == bool(self.result_field):
            raise ValueError("Choose an explicit artifact or a declared result field, not both.")
        return self

    kind: Literal["structure", "ligand"]
    record: int = Field(default=0, ge=0, le=499)
    target: Literal[
        "protein", "initial", "molecule", "reference_ligand", "property_input", "docking_ligand"
    ]


class Step(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,31}$")
    request: TaskRequest
    depends_on: tuple[str, ...] = Field(default=(), max_length=30)
    bindings: tuple[Binding, ...] = Field(default=(), max_length=20)
    retries: int = Field(default=0, ge=0, le=2)
    retry_backoff_seconds: int = Field(default=5, ge=1, le=300)


class Budget(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    max_jobs: int = Field(default=30, ge=1, le=100)
    wall_seconds: int = Field(default=3600, ge=1, le=86400)


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    name: str = Field(min_length=1, max_length=120, pattern=r"^[^\x00-\x1f]+$")
    steps: tuple[Step, ...] = Field(min_length=1, max_length=30)
    budget: Budget = Field(default_factory=Budget)
    failure_policy: Literal["stop", "continue_independent"] = "stop"

    @model_serializer(mode="wrap")
    def stable_default_wire(self, handler):
        data = handler(self)
        # Existing immutable plans/keys keep their original byte representation.
        if self.failure_policy == "stop":
            data.pop("failure_policy", None)
        return data

    @model_validator(mode="after")
    def valid_graph(self) -> Self:
        if self.failure_policy == "continue_independent" and any(
            step.depends_on or step.bindings for step in self.steps
        ):
            raise ValueError("Continuing after failure is supported only for independent steps.")
        identifiers = {step.id for step in self.steps}
        if len(identifiers) != len(self.steps):
            raise ValueError("Workflow step IDs must be unique.")
        if sum(1 + step.retries for step in self.steps) > self.budget.max_jobs:
            raise ValueError("Job budget must cover steps and permitted retries.")
        resolved = set()
        for step in self.steps:
            deps = set(step.depends_on)
            if len(deps) != len(step.depends_on) or not deps <= resolved:
                raise ValueError(
                    "Dependencies must name unique preceding steps; cycles are forbidden."
                )
            if any(binding.from_step not in deps for binding in step.bindings):
                raise ValueError("Output bindings must come from explicitly declared dependencies.")
            if len({binding.target for binding in step.bindings}) != len(step.bindings):
                raise ValueError("A workflow input slot can have only one binding.")
            for binding in step.bindings:
                predecessor = next(s for s in self.steps if s.id == binding.from_step)
                if predecessor.request.operation == "molecular_states" and binding.target not in {
                    "property_input",
                    "docking_ligand",
                }:
                    raise ValueError(
                        "Prepared states/conformers require property calculation or new docking; "
                        "they are not aligned binding poses."
                    )
                if (binding.target == "protein") != (binding.kind == "structure"):
                    raise ValueError(
                        "Protein slots require structures; molecular slots require ligands."
                    )
                if binding.target == "property_input" and step.request.operation != "properties":
                    raise ValueError("Property bindings require a properties task.")
                if binding.target == "docking_ligand":
                    if step.request.operation != "docking" or step.request.mode != "dock":
                        raise ValueError(
                            "Dynamic ligand bindings require new docking; "
                            "existing poses need explicit frame evidence."
                        )
                    continue
                if binding.target != "property_input" and not (
                    step.request.operation == "diffsbdd"
                    or step.request.operation == "pocket_search"
                    and binding.target == "protein"
                ):
                    raise ValueError("Scientific reference slots require a typed DiffSBDD task.")
            resolved.add(step.id)
        return self


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


RunState = Literal["running", "paused", "blocked", "cancelling", "cancelled", "succeeded", "failed"]
