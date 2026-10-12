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
    kind = {
        "structure": "structure",
        "ligand": "molecule",
        "sequences": "sequence",
    }[file.kind]
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
    originals = {
        key: register_input(scientific, key)
        for key, spec in FILES.items()
        if spec.kind in {"structure", "ligand", "sequences"}
    }
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
        "variable_domains": originals["dupilumab_variable_domains"],
    }
    if capability in {"biopython.exposure", "biopython.ensemble"}:
        from .prepared_inputs import reviewed_receptor

        receptor = reviewed_receptor(scientific, records)
        role = "receptor" if capability == "biopython.exposure" else "receptor_a"
        if receptor is None:
            # 9BIG contains observed alternate positions. A raw reference is not
            # silently converted into a preparation that resolves that choice.
            objects.pop(role)
        else:
            objects[role] = receptor
    if capability in {
        "openmm.dynamics",
        "gromacs.dynamics",
        "openfe.rbfe",
    }:
        # Unbound conformers remain available in the reference preview, but
        # never prefill a field that requires an aligned calculated binding pose.
        objects.pop("ligand")
    if capability == "diffsbdd.pocket":
        objects["ligand"] = originals["bound_reference"]
    if capability in {
        "gnina.score",
        "gnina.minimize",
        "posebusters.check",
        "diffsbdd.interactions",
        "diffsbdd.inpaint",
        "diffsbdd.diversify",
        "diffsbdd.optimize",
    }:
        objects["ligand"] = originals["calculated_pose"]
        objects["receptor"] = originals["calculated_receptor"]
    if capability in {"chemprop.train", "chemistry.screen"}:
        objects["library"] = originals["stat6_assay_library"]
        objects["ligand"] = originals["stat6_assay_library"]
    sequence = "".join(verified_input("stat6_sequence").decode().splitlines()[1:])
    if len(sequence) != 847:
        raise ValueError("The fixed canonical STAT6 sequence differs from its reviewed length.")
    sequences = {"protein": sequence, "antigen": sequence, "target": sequence}
    sequences["observed_protein"] = "".join(
        verified_input("stat6_observed_sequence").decode().splitlines()[1:]
    )
    for key in ("heavy", "light"):
        sequences[key] = "".join(verified_input("dupilumab_" + key).decode().splitlines()[1:])
    if capability in {"antibody.humanize", "antibody.number", "fold", "epitope", "campaign"}:
        sequences["antigen"] = "".join(
            verified_input("dupilumab_antigen").decode().splitlines()[1:]
        )
        objects["antigen_sequence"] = originals["dupilumab_antigen"]
        objects["structure"] = originals["dupilumab_complex"]
    from .experimental_inputs import evidence_draft
    from .requests import study_request

    measured_file = FILES["stat6_measurements"]
    # EvidenceRecords owns measurement semantics. Preserve its existing immutable
    # asset authority rather than registering a CSV as a configuration object.
    measurements = scientific.assets.save(
        measured_file.name, measured_file.kind, verified_input("stat6_measurements")
    )

    sequence_sources = {
        key: (sequence,) for key in ("protein_sequence", "target_sequence", "stat6_sequence")
    }
    sequence_sources.update(
        {
            "antigen_sequence": (sequences["antigen"],),
            "variable_domains": (sequences["heavy"], sequences["light"]),
            "dupilumab_variable_domains": (sequences["heavy"], sequences["light"]),
            "stat6_observed_sequence": (sequences["observed_protein"],),
        }
    )

    return PreparedExample(
        module=module,
        case=CASE,
        objects=objects,
        data_assets={"stat6_measurements": measurements},
        sequences=sequences,
        sequence_sources=sequence_sources,
        sources=CASE.sources,
        request=study_request(capability, objects, sequences),
        campaign_draft={
            "targetName": "STAT6 pathway · IL-4R alpha · 6WGL",
            "targets": {"C": sequences["antigen"]},
            "format": "VHVL",
            "binders": {"A": sequences["heavy"], "B": sequences["light"]},
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
        evidence_draft=evidence_draft(scientific, objects, measurements)
        if capability == "experimental.evidence"
        else None,
    )
