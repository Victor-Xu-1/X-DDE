"""Independent quality environment beneath the shared restricted platform lifecycle."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = ("runner.py", "native_inputs.py", "normalize.py", "options.py", "manifest.py")


class QualityBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings,
            "posebusters",
            Path(__file__).parent,
            FILES,
            configuration,
            readiness,
            shared_sources={"sdf_io.py": Path(__file__).parents[1] / "chemistry/sdf_io.py"},
        )
