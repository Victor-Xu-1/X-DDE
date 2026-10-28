"""Use a reviewed native preparation by exact provenance, never by a filename guess."""

from ...receptors.preparation_result import StructurePrepareResult, validate_preparation
from ..pins import ExamplePins
from ..receptor_provenance import prepared_receptor_origin
from .catalogue import FILES


def reviewed_receptor(scientific, records, *, retain_reference_ligand=False):
    if records is None:
        return None
    state = records.settings.state_dir
    pin = ExamplePins(scientific.store, state, modules=records.modules).get(
        "biopython.prepare", verify=True
    )
    if pin is None or pin.review is None:
        return None
    result = StructurePrepareResult.model_validate_json(
        (state / "jobs" / str(pin.job_id) / "output" / "result.json").read_text()
    )
    if result.source.sha256 != FILES["stat6_structure"].sha256:
        raise ValueError("The reviewed preparation does not belong to this STAT6 construct.")
    if retain_reference_ligand and (
        result.options.format != "cif"
        or result.options.heterogens != "keep"
        or result.options.chains != ("A",)
        or result.options.alternate != "A"
        or result.options.waters
    ):
        raise ValueError(
            "Use the reviewed chain-A CIF retaining the reference ligand and explicit alternate A."
        )
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


def reviewed_protein_only_receptor(scientific, records):
    """Reuse the exact prepared protein consumed by the reviewed docking case."""
    if records is None:
        return None
    state = records.settings.state_dir
    pins = ExamplePins(scientific.store, state, modules=records.modules)
    pin = pins.get("gnina.dock", verify=True)
    if pin is None:
        # A successor cannot be pinned until its inputs have been prepared.
        # Reuse only the latest sealed predecessor and validate its source below.
        pin = pins.predecessor("gnina.dock", verify=True)
    if pin is None or pin.review is None:
        return None
    docking = scientific.store.get(str(pin.job_id))
    ref = docking.request.receptor
    if ref.version_id is None:
        raise ValueError("The reviewed docking receptor requires an exact prepared version.")
    scientific.validate_reference(ref)
    version, preparation = prepared_receptor_origin(
        scientific, state, scientific.get(ref.version_id)
    )
    output = state / "jobs" / preparation.id / "output"
    result = validate_preparation(
        StructurePrepareResult.model_validate_json((output / "result.json").read_text()),
        preparation.request,
        output,
    )
    options = result.options
    if (
        result.source.sha256 != FILES["stat6_structure"].sha256
        or result.sha256 != ref.sha256
        or options.format != "pdb"
        or options.chains != ("A",)
        or options.alternate != "A"
        or options.waters
        or options.heterogens != "remove"
        or options.model_index != 0
    ):
        raise ValueError(
            "The reviewed docking receptor differs from the explicit STAT6 preparation."
        )
    asset = scientific.assets.get(version.reference.asset_id)
    if (asset.name, asset.kind, asset.sha256) != (result.artifact, "structure", result.sha256):
        raise ValueError("The docking receptor asset differs from its native prepared artifact.")
    if scientific.assets.path(asset).read_bytes() != (output / result.artifact).read_bytes():
        raise ValueError("The registered docking receptor bytes changed.")
    return version
