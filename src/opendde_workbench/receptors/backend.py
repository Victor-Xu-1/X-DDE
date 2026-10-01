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
)


class ReceptorBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings, "biopython", Path(__file__).parent, FILES, configuration, readiness
        )
