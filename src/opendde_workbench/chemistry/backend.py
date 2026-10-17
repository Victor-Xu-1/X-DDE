"""Chemical preparation uses the platform's bounded container lifecycle."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = (
    "runner.py",
    "native_cluster.py",
    "cluster_geometry.py",
    "cluster_contacts.py",
    "cluster_groups.py",
    "cluster_options.py",
    "states.py",
    "mapping.py",
    "conformers.py",
    "options.py",
    "native_screen.py",
    "screen_io.py",
    "sdf_io.py",
    "molfile_stereo.py",
    "screen_options.py",
    "screen_inspection.py",
    "screen_selection.py",
    "screen_report.py",
    "screen_record.py",
    "native_minimization.py",
    "minimization_options.py",
    "minimization_geometry.py",
    "native_properties.py",
)
SHARED_SOURCES = {
    name: Path(__file__).parent.parent / "native_runtime" / name
    for name in ("property_calculation.py", "molecule_math.py")
}


class ChemistryBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings,
            "chemistry",
            Path(__file__).parent,
            FILES,
            configuration,
            readiness,
            shared_sources=SHARED_SOURCES,
        )
