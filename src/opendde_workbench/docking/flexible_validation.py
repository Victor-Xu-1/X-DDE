"""Host request/result correspondence and independent native-pair revalidation."""

from pathlib import Path

from .contract import DockingTask
from .flexible_receptor import verify_pair
from .result import DockingResult


def verify_refinement(root: Path, request: DockingTask, result: DockingResult) -> None:
    if (result.receptor_refinement is None) != (request.flexible_receptor is None):
        raise ValueError("Native result differs from the requested receptor refinement.")
    if result.receptor_refinement is not None:
        verify_pair(
            root,
            request.receptor.sha256,
            request.flexible_receptor.tokens,
            result.receptor_refinement.model_dump(mode="json"),
        )
