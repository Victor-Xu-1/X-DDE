"""Biopython is an independent environment beneath the same X-DDE queue/router."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = (
    "runner.py",
    "native_io.py",
    "profiles.py",
    "correspondence.py",
    "native_fit.py",
    "selection.py",
    "preparation_options.py",
    "native_preparation.py",
    "native_selection.py",
    "native_surface.py",
    "surface_options.py",
)


class ReceptorBackend(PreparedContainerBackend):
    def __init__(self, settings):
        comparison = Path(__file__).parent.parent / "structure_comparison"
        shared = {
            "comparison_native.py": comparison / "native_entry.py",
            "comparison_options.py": comparison / "options.py",
        }
        shared.update(
            {
                "comparison_" + name + ".py": comparison / ("native_" + name + ".py")
                for name in (
                    "matching",
                    "geometry",
                    "polymer",
                    "export",
                    "quality",
                    "quality_model",
                    "reports",
                )
            }
        )
        super().__init__(
            settings,
            "biopython",
            Path(__file__).parent,
            FILES,
            configuration,
            readiness,
            shared_sources=shared,
        )
