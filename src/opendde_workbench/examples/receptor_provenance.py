"""Resolve byte-preserving native receptor copies to their preparation authority."""

import json

from ..artifacts import contained
from ..docking.contract import DockingTask
from ..receptors.contract import ReceptorEnsembleTask
from ..receptors.preparation_contract import StructurePrepareTask
from ..receptors.result import validate_result
from .evidence import capture_job
from .input_lineage import MAX_SOURCE_DEPTH


def prepared_receptor_origin(scientific, state, version):
    seen = set()
    expected = version.reference.sha256
    for _ in range(MAX_SOURCE_DEPTH + 1):
        if version.id in seen:
            raise ValueError("The receptor preparation lineage contains a cycle.")
        seen.add(version.id)
        scientific.validate_reference(version.reference)
        if (
            version.kind != "structure"
            or version.reference.sha256 != expected
            or version.reference.record != 0
            or version.reference.conformer != 0
        ):
            raise ValueError("The receptor copy differs from its exact native preparation bytes.")
        source = scientific.store.get(str(version.source_job)) if version.source_job else None
        if (
            source is None
            or source.status != "succeeded"
            or scientific.store.environment(source.id) is None
        ):
            raise ValueError("The receptor has no successful native preparation provenance.")
        if isinstance(source.request, StructurePrepareTask):
            return version, source
        if isinstance(source.request, ReceptorEnsembleTask):
            output = state / "jobs" / source.id / "output"
            report_path = contained(output, "result.json")
            if report_path.stat().st_size > 16 * 1024**2:
                raise ValueError("The ensemble receptor report exceeds the provenance size budget.")
            report = validate_result(
                json.loads(report_path.read_text()), source.request, output
            )
            member = report.members[report.options.reference_index]
            original = member.source.structure
            evidence = capture_job(scientific.store, state, source.id)
            if (
                member.status != "reference"
                or original.version_id is None
                or version.parent_id != original.version_id
                or original.sha256 != expected
                or original.record != 0
                or original.conformer != 0
                or member.artifact_sha256 != expected
                or evidence.artifact_sha256.get(member.artifact) != expected
            ):
                raise ValueError("The ensemble reference does not retain the exact source bytes.")
            version = scientific.get(original.version_id)
            continue
        if not isinstance(source.request, DockingTask):
            raise ValueError("The receptor is not a verified native preparation or docking copy.")
        original = source.request.receptor
        if (
            original.version_id is None
            or version.parent_id != original.version_id
            or original.sha256 != expected
            or original.record != 0
            or original.conformer != 0
        ):
            raise ValueError("The receptor copy does not retain the exact typed source version.")
        evidence = capture_job(scientific.store, state, source.id)
        if evidence.artifact_sha256.get("receptor.pdb") != expected:
            raise ValueError("The native receptor copy is missing or its bytes changed.")
        version = scientific.get(original.version_id)
    raise ValueError("The receptor preparation lineage exceeds its bounded source budget.")
