"""Execution-only bounds; historical descriptor request digests stay unchanged."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PropertyBudget:
    cpu: int = 1
    memory_mib: int = 2048
