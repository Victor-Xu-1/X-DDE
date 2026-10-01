"""Reuse the platform's single container, cancellation and recovery authority."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from .runtime import configuration, readiness

FILES = (
    "runner.py",
    "native_inputs.py",
    "native_models.py",
    "native_domains.py",
    "native_evaluation.py",
    "proposals.py",
    "options.py",
    "manifest.py",
    "metadata.json",
)


class HumanizationBackend(PreparedContainerBackend):
    def __init__(self, settings):
        parent = Path(__file__).parents[1]
        super().__init__(
            settings,
            "sapiens",
            Path(__file__).parent,
            FILES,
            configuration,
            readiness,
            shared_sources={
                "fasta.py": parent / "antibodies/fasta.py",
                "native_numbering.py": parent / "antibodies/native_numbering.py",
            },
        )
