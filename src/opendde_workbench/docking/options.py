"""Pure models reused by the platform and the isolated native interpreter."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self

Coordinate = Annotated[float, Field(allow_inf_nan=False, ge=-100000, le=100000)]
Length = Annotated[float, Field(allow_inf_nan=False, ge=4, le=100)]


class SearchBox(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    center: tuple[Coordinate, Coordinate, Coordinate]
    size: tuple[Length, Length, Length]
    unit: Literal["angstrom"] = "angstrom"


class DockingOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    scoring: Literal["vina", "vinardo"] = "vina"
    cnn_scoring: Literal["none", "rescore", "refinement", "all"] = "none"
    use_gpu: bool = Field(default=False, strict=True)
    gpu_device: int = Field(default=0, strict=True, ge=0, le=15)
    cpu: int = Field(default=2, strict=True, ge=1, le=32)
    memory_mib: int = Field(default=4096, strict=True, ge=2048, le=65536)
    time_limit_seconds: int = Field(default=900, strict=True, ge=30, le=7200)
    exhaustiveness: int = Field(default=8, strict=True, ge=1, le=128)
    num_modes: int = Field(default=9, strict=True, ge=1, le=100)
    seed: int = Field(default=2026, strict=True, ge=0, le=2147483647)
    min_rmsd_filter: float = Field(default=1, ge=0.1, le=10, allow_inf_nan=False)
    minimize_iters: int = Field(default=0, strict=True, ge=0, le=10000)
    autobox_add: float = Field(default=4, ge=0, le=30, allow_inf_nan=False)

    @model_validator(mode="after")
    def bounded_search(self) -> Self:
        if self.exhaustiveness * self.num_modes > 1280:
            raise ValueError("Limit the search to at most 1280 exhaustiveness × pose slots.")
        if self.cnn_scoring in {"refinement", "all"} and not self.use_gpu:
            raise ValueError("High-cost CNN search/refinement requires explicit GPU selection.")
        return self


def arguments(options: DockingOptions, mode: str) -> list[str]:
    if mode not in {"dock", "score", "minimize"}:
        raise ValueError("Unsupported docking mode.")
    args = [
        "--scoring",
        options.scoring,
        "--cnn_scoring",
        options.cnn_scoring,
        "--cpu",
        str(options.cpu),
        "--seed",
        str(options.seed),
    ]
    if options.use_gpu:
        args.extend(["--device", str(options.gpu_device)])
    else:
        args.append("--no_gpu")
    if mode == "dock":
        args.extend(
            [
                "--exhaustiveness",
                str(options.exhaustiveness),
                "--num_modes",
                str(options.num_modes),
                "--min_rmsd_filter",
                str(options.min_rmsd_filter),
            ]
        )
    else:
        args.append("--score_only" if mode == "score" else "--minimize")
        if mode == "minimize":
            args.extend(["--minimize_iters", str(options.minimize_iters)])
    return args
