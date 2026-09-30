"""Integrated scientific environments managed by the X-DDE platform server.

This registry owns task-to-engine identity. BackendRouter remains the sole execution
and recovery authority; a registration never downloads or executes software.
"""

from dataclasses import asdict, dataclass
from types import MappingProxyType
from typing import Literal


@dataclass(frozen=True)
class ScientificEngine:
    id: str
    name: str
    description: str
    execution_backend: Literal["docker", "local_process", "harness_process"]
    operations: tuple[str, ...]
    role: Literal["integrated_environment"] = "integrated_environment"


_DEFINITIONS = (
    ScientificEngine(
        "opendde",
        "OpenDDE",
        "结构与复合物预测、特征准备和原生化学工具 / Structures, features and native chemical tools",
        "docker",
        ("predict", "msa", "mt", "prep", "inspect", "json", "doctor", "properties", "resources"),
    ),
    ScientificEngine(
        "diffsbdd",
        "DiffSBDD",
        (
            "小分子生成、局部重设计、多样化和优化 / "
            "Small-molecule generation, inpainting and optimization"
        ),
        "local_process",
        ("diffsbdd",),
    ),
    ScientificEngine(
        "harness",
        "OpenDDE Harness",
        (
            "原生科学工具与设计代理；计算服务和模型另行配置 / "
            "Native tools and design agents; configure services and models separately"
        ),
        "harness_process",
        ("harness",),
    ),
)
ENGINES = MappingProxyType({engine.id: engine for engine in _DEFINITIONS})
_OPERATIONS = MappingProxyType(
    {operation: engine.id for engine in _DEFINITIONS for operation in engine.operations}
)
if len(_OPERATIONS) != sum(len(engine.operations) for engine in _DEFINITIONS):
    raise RuntimeError("Each scientific task operation must belong to exactly one engine.")


def engine_for(operation: str) -> ScientificEngine:
    try:
        return ENGINES[_OPERATIONS[operation]]
    except KeyError as exc:
        raise ValueError("Unregistered scientific operation: " + operation) from exc


def catalogue() -> dict[str, dict]:
    return {identifier: asdict(engine) for identifier, engine in ENGINES.items()}


def statuses(readiness: dict) -> dict[str, dict]:
    # The historical 'engine' health field is OpenDDE's snapshot, not platform health.
    states = readiness.get("backends", {"opendde": readiness})
    return {
        identifier: {
            "ready": False,
            "reason": None
            if identifier in states
            else "This engine does not report runtime state in this deployment.",
            **states.get(identifier, {}),
            **definition,
        }
        for identifier, definition in catalogue().items()
    }
