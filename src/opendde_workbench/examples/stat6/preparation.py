"""Import fixed study inputs through the platform's existing immutable scientific store."""

import hashlib
from uuid import UUID, uuid5

from ...research.contracts import VersionInput
from ..contracts import PreparedExample
from .catalogue import CASE, FILES, MODULES, study_context, verified_input

NAMESPACE = UUID("dc83ffaf-3aef-49fc-af71-bf9732d06a78")


def register_input(scientific, key):
    file = FILES[key]
    content = verified_input(key)
    kind = {"structure": "structure", "ligand": "molecule", "sequences": "sequence"}[file.kind]
    identity = uuid5(NAMESPACE, f"{CASE.id}:{CASE.revision}:{key}:{file.sha256}")
    label = "STAT6 study · " + file.name
    notes = "Fixed study input; source: " + file.url
    try:
        retained = scientific.get_for_key(identity)
    except KeyError:
        retained = None
    if retained is not None:
        asset = scientific.assets.get(retained.reference.asset_id)
        if (asset.name, asset.kind, asset.sha256) != (file.name, file.kind, file.sha256) or (
            retained.kind,
            retained.label,
            retained.notes,
            retained.reference.record,
        ) != (kind, label, notes, 0):
            raise ValueError(
                "The retained STAT6 input identity changed; create a reviewed revision."
            )
        if hashlib.sha256(scientific.assets.path(asset).read_bytes()).hexdigest() != file.sha256:
            raise ValueError("The retained STAT6 material bytes changed.")
        return retained
    asset = scientific.assets.save(file.name, file.kind, content)
    return scientific.create(
        VersionInput(asset_id=asset.id, kind=kind, label=label, notes=notes), identity
    )


def prepare_stat6(capability, scientific, *, records=None):
    module = MODULES[capability]
    originals = {key: register_input(scientific, key) for key in FILES}
    objects = {
        **originals,
        "structure": originals["stat6_structure"],
        "receptor": originals["stat6_receptor"],
        "protein_only": originals["stat6_receptor"],
        "target_construct": originals["stat6_receptor"],
        "target": originals["stat6_receptor"],
        "protein_sequence": originals["stat6_sequence"],
        "antigen_sequence": originals["stat6_sequence"],
        "target_sequence": originals["stat6_sequence"],
        "ligand": originals["study_ligand"],
        "library": originals["study_ligand"],
        "bifunctional_molecule": originals["study_protac"],
        "pocket_reference": originals["bound_reference"],
        "partner_a": originals["crbn_receptor"],
        "partner_b": originals["stat6_receptor"],
        "receptor_a": originals["stat6_receptor"],
        "receptor_b": originals["stat6_alternative_receptor"],
    }
    sequence = "".join(verified_input("stat6_sequence").decode().splitlines()[1:])
    if len(sequence) != 847:
        raise ValueError("The fixed canonical STAT6 sequence differs from its reviewed length.")
    sequences = {"protein": sequence, "antigen": sequence, "target": sequence}
    from .requests import study_request

    return PreparedExample(
        module=module,
        case=CASE,
        objects=objects,
        sequences=sequences,
        sequence_sources={
            key: (sequence,)
            for key in ("protein_sequence", "antigen_sequence", "target_sequence", "stat6_sequence")
        },
        sources=CASE.sources,
        request=study_request(capability, objects, sequences),
        campaign_draft={
            "targetName": "STAT6 · P42226",
            "targets": {"A": sequence},
            "format": "VHH",
            "binders": {"B": ""},
            "cdr": {},
            "fixed": {},
            "budget": "standard",
        }
        if capability == "campaign"
        else None,
        record=records.prepared(capability) if records else None,
        source_record=records.prepared(module.parent_capability)
        if records and module.parent_capability
        else None,
        study=study_context(capability),
    )
