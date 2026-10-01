"""Use the shared managed container lifecycle; do not start a second prediction service."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = (
    "runner.py",
    "models.py",
    "native_inputs.py",
    "options.py",
    "manifest.py",
    "metadata.json",
    "serialization.py",
)


class AdmetBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings,
            "admet",
            Path(__file__).parent,
            FILES,
            configuration,
            readiness,
            shared_sources={"sdf_io.py": Path(__file__).parents[1] / "chemistry/sdf_io.py"},
        )
