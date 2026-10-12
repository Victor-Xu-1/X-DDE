"""Use a reviewed native preparation by exact provenance, never by a filename guess."""

from ...receptors.preparation_result import StructurePrepareResult
from ..pins import ExamplePins
from .catalogue import FILES, MODULES


def reviewed_receptor(scientific, records):
    if records is None:
        return None
    state = records.settings.state_dir
    pin = ExamplePins(scientific.store, state, modules=MODULES).get(
        "biopython.prepare", verify=True
    )
    if pin is None or pin.review is None:
        return None
    result = StructurePrepareResult.model_validate_json(
        (state / "jobs" / str(pin.job_id) / "output" / "result.json").read_text()
    )
    if result.source.sha256 != FILES["stat6_structure"].sha256:
        raise ValueError("The reviewed preparation does not belong to this STAT6 construct.")
    versions = scientific.list(
        source_job=pin.job_id,
        asset_name=result.artifact,
        sha256=result.sha256,
        kind="structure",
        record=0,
    )
    if len(versions) != 1:
        raise ValueError("The reviewed receptor must resolve to one exact native result version.")
    scientific.validate_reference(versions[0].reference)
    return versions[0]
