"""Fixed scientific adapter beneath the shared restricted container lifecycle."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = ("runner.py", "fasta.py", "native_numbering.py", "options.py")


class AntibodyBackend(PreparedContainerBackend):
    def __init__(self, settings):
        super().__init__(
            settings, "anarcii", Path(__file__).parent, FILES, configuration, readiness
        )
