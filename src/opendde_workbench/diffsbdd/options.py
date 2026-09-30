"""Reviewed public contract for the pinned native DiffSBDD adapter.

Ranges mirror local_diffsbdd/options.py at 55f365b195d126ec25f7e7ae00ff253fd4491dac.
Native validation is repeated inside its isolated environment before scientific execution.
"""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

DiffMode = Literal["generate", "inpaint", "diversify", "optimize"]


class DiffOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_default=True)
    task: DiffMode = "generate"
    model: str = Field(
        default="crossdocked_fullatom_cond",
        pattern=r"^(crossdocked|moad)_(ca|fullatom)_(cond|joint)$",
    )
    count: int = Field(default=3, ge=1, le=100)
    atoms: int = Field(default=32, ge=8, le=80)
    size_mode: Literal["fixed", "sample"] = "fixed"
    size_bias: int = Field(default=0, ge=-30, le=30)
    minimum_atoms: int = Field(default=8, ge=8, le=80)
    seed: int = Field(default=2026, ge=0, le=2147483647)
    steps: int = Field(default=500, ge=10, le=500)
    resamplings: int = Field(default=1, ge=1, le=20)
    jump_length: int = Field(default=1, ge=1, le=50)
    fragment_policy: Literal["largest", "all"] = "largest"
    relaxation: int = Field(default=0, ge=0, le=1000)
    fixed_atoms: list[int] = Field(default_factory=list, max_length=80)
    preserve_bonds: bool = True
    added_atoms: int = Field(default=10, ge=0, le=79)
    center: Literal["ligand", "pocket"] = "ligand"
    trajectory: bool = False
    objective: Literal["qed", "sa"] = "qed"
    population: int = Field(default=10, ge=1, le=100)
    rounds: int = Field(default=2, ge=1, le=20)
    survivors: int = Field(default=3, ge=1, le=100)
    change_steps: int = Field(default=100, ge=1, le=500)

    @model_validator(mode="after")
    def supported_combination(self) -> Self:
        if self.task != "generate" and not self.model.endswith("_cond"):
            raise ValueError("This design mode requires a conditional model.")
        if (
            self.task == "generate"
            and self.model.endswith("_joint")
            and self.jump_length > self.steps
        ):
            raise ValueError("Jump length cannot exceed diffusion steps.")
        if self.trajectory and (self.task != "inpaint" or self.count != 1):
            raise ValueError("Trajectories require inpainting with exactly one candidate.")
        if self.task == "inpaint":
            if (
                not self.fixed_atoms
                or min(self.fixed_atoms) < 0
                or len(set(self.fixed_atoms)) != len(self.fixed_atoms)
            ):
                raise ValueError("Select at least one fixed atom, without duplicate indices.")
            if self.relaxation or self.fragment_policy != "all":
                raise ValueError(
                    "Inpainting must preserve all fragments and disable free relaxation."
                )
        if self.task == "optimize":
            if self.survivors > self.population:
                raise ValueError("Survivors cannot exceed population size.")
            if self.population * self.rounds > 100:
                raise ValueError("Optimization supports at most 100 attempted candidates per task.")
        return self

    @property
    def attempts(self) -> int:
        return self.population * self.rounds if self.task == "optimize" else self.count
