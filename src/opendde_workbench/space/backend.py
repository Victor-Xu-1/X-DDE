"""Observed-structure channels beneath the shared Router and Worker."""

from ..prepared_container import PreparedContainerBackend
from .adapter_sources import FILES, ROOT, SHARED_SOURCES
from .runtime import configuration, readiness


class SpaceBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings, "caver", ROOT, FILES, configuration, readiness, shared_sources=SHARED_SOURCES
        )
