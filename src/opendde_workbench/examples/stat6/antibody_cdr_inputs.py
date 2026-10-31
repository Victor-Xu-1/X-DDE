"""Sequence-exact interface annotations from an existing reviewed native numberer."""

import json
from uuid import UUID, uuid5

from ...antibodies.result import validate_numbering
from ...artifacts import contained
from ...research.contracts import VersionInput
from ..pins import ExamplePins

NAMESPACE = UUID("c954b5cd-e082-4277-bfa2-96fd9d7248f5")


def interface_positions(result, sequences):
    """Convert validated one-based source positions, never IMGT residue numbers."""
    groups = {}
    if len(result.domains) != 2 or not all(domain.available for domain in result.domains):
        raise ValueError("Interface preparation requires two complete numbered variable domains.")
    for chain, role, types in (("A", "heavy", {"H"}), ("B", "light", {"K", "L"})):
        sequence = sequences[role]
        matches = [domain for domain in result.domains if domain.sequence == sequence]
        if len(matches) != 1:
            raise ValueError("Numbering must match each exact variable-domain sequence once.")
        domain = matches[0]
        if domain.chain_type not in types or (domain.start, domain.end) != (0, len(sequence) - 1):
            raise ValueError("Interface numbering requires the complete heavy/light input domains.")
        groups[chain] = {
            name: [row.source_position - 1 for row in domain.numbering if row.region == name]
            for name in ("CDR1", "CDR2", "CDR3")
        }
        if any(not positions for positions in groups[chain].values()):
            raise ValueError("All three native CDR annotations must be present on each chain.")
    return groups


def reviewed_antibody_cdr(
    scientific, records, sequence_parent, sequences, *, structure_parent=None
):
    """Curate immutable input provenance without inference or rewriting old results."""
    if records is None:
        return None
    pin = ExamplePins(scientific.store, records.settings.state_dir, modules=records.modules).get(
        "antibody.number", verify=True
    )
    if pin is None or pin.review is None:
        return None
    job = scientific.store.get(str(pin.job_id))
    if job.request.operation != "antibody_number":
        raise ValueError("Interface annotations require a reviewed native numbering task.")
    scientific.validate_reference(sequence_parent.reference)
    if job.request.sequences.sha256 != sequence_parent.reference.sha256:
        raise ValueError("Numbering source differs from the selected variable-domain material.")
    source = scientific.assets.get(job.request.sequences.asset_id)
    output = records.settings.state_dir / "jobs" / str(pin.job_id) / "output"
    file = contained(output, "result.json")
    if file.stat().st_size > 2 * 1024**2:
        raise ValueError("Native numbering report exceeds the managed input limit.")
    result = validate_numbering(
        json.loads(file.read_text(encoding="utf-8")),
        job.request,
        output,
        source_file=scientific.assets.path(source),
    )
    groups = interface_positions(result, sequences)
    provenance = {
        "numbering_job": str(pin.job_id),
        "numbering_result_sha256": pin.artifact_sha256["result.json"],
        "sequence_source": sequence_parent.reference.model_dump(mode="json"),
        "scheme": result.scheme,
        "positions": "zero_based_sequence_order",
        "chains": {"A": sequences["heavy"], "B": sequences["light"]},
        "cdr_regions": groups,
        "method": "Native IMGT region labels mapped by source_position minus one; no inference.",
        "scope": "6WGL deposited Fab / IL4Ralpha; STAT6 pathway, not direct STAT6 binding.",
    }
    # Annotation versions retain actual task-input bytes. A provenance-only
    # config attachment is not an accepted Harness scientific input.
    parent = structure_parent or sequence_parent
    scientific.validate_reference(parent.reference)
    if structure_parent is not None:
        provenance["coordinate_source"] = parent.reference.model_dump(mode="json")
    notes = json.dumps(provenance, sort_keys=True)
    obj = scientific.create(
        VersionInput(
            asset_id=parent.reference.asset_id,
            kind=parent.kind,
            label="STAT6 pathway · Native-numbered Fv CDR inputs",
            parent_id=parent.id,
            relation="prepared_from",
            notes=notes,
        ),
        uuid5(NAMESPACE, str(pin.job_id) + ":" + str(parent.id) + ":" + notes),
        source_job=pin.job_id,
        validation="file_integrity_only",
    )
    return {
        "object": obj,
        "groups": groups,
        "cdr_regions": {chain: sum(regions.values(), []) for chain, regions in groups.items()},
        "cdr3_positions": {chain: regions["CDR3"] for chain, regions in groups.items()},
    }
