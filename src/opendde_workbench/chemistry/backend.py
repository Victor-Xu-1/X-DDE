"""Chemical preparation uses the platform's bounded container lifecycle."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = (
    "runner.py",
    "states.py",
    "mapping.py",
    "conformers.py",
    "options.py",
    "native_screen.py",
    "screen_io.py",
    "sdf_io.py",
    "screen_options.py",
    "screen_inspection.py",
    "screen_selection.py",
    "screen_report.py",
    "screen_record.py",
    "native_minimization.py",
    "minimization_options.py",
    "minimization_geometry.py",
)


class ChemistryBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings, "chemistry", Path(__file__).parent, FILES, configuration, readiness
        )
