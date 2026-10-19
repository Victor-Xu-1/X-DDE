"""Import fixed study inputs through the platform's existing immutable scientific store."""

import hashlib
from uuid import UUID, uuid5

from ...research.contracts import VersionInput
from ..contracts import PreparedExample
from .catalogue import CASE, FILES, MODULES, study_context, verified_input
from .reference_inputs import case_for, input_keys
from .request_replay import replay_context, reviewed_request

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
    case = case_for(capability)
    native_request = reviewed_request(capability, scientific, records)
    originals = {
        key: register_input(scientific, key)
        for key in input_keys(capability)
        if FILES[key].kind in {"structure", "ligand", "sequences"}
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
    if capability == "rmsd":
        objects["comparison_reference"] = originals["stat6_alternative"]
        objects["comparison_moving"] = originals["stat6_dna_bound"]
    if capability in {
        "biopython.exposure",
        "biopython.ensemble",
        "caver.paths",
        "ligandmpnn.design",
    }:
        from .prepared_inputs import reviewed_receptor

        receptor = reviewed_receptor(
            scientific,
            records,
            retain_reference_ligand=capability in {"caver.paths", "ligandmpnn.design"},
        )
        role = (
            "receptor_a"
            if capability == "biopython.ensemble"
            else "structure"
            if capability == "ligandmpnn.design"
            else "receptor"
        )
        if receptor is None:
            # 9BIG contains observed alternate positions. A raw reference is not
            # silently converted into a preparation that resolves that choice.
            objects.pop(role)
        else:
            objects[role] = receptor
    if capability in {
        "gnina.dock",
        "diffsbdd.prepare",
        "diffsbdd.generate",
        "apbs.potential",
    }:
        from .prepared_inputs import reviewed_protein_only_receptor

        receptor = reviewed_protein_only_receptor(scientific, records)
        if receptor is None:
            objects.pop("receptor")
            if capability == "diffsbdd.prepare":
                objects.pop("structure")
            if capability == "apbs.potential":
                objects.pop("protein_only")
        else:
            objects["receptor"] = receptor
            if capability == "diffsbdd.prepare":
                objects["structure"] = receptor
            if capability == "apbs.potential":
                objects["protein_only"] = receptor
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
    if capability in {"diffsbdd.diversify", "diffsbdd.optimize"}:
        from .prepared_inputs import reviewed_protein_only_receptor

        experimental = reviewed_protein_only_receptor(scientific, records)
        if experimental is not None:
            # A curated control input, not a replacement for the native paired
            # prediction frame or permission to admit arbitrary follow-up roots.
            objects["experimental_receptor_control"] = experimental
    if capability in {"chemprop.train", "chemistry.screen"}:
        library_key = (
            "stat6_spr_library" if capability == "chemprop.train" else "stat6_assay_library"
        )
        objects["library"] = originals[library_key]
        objects["ligand"] = originals[library_key]
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
    data_assets = {"stat6_measurements": measurements}
    for key in input_keys(capability):
        spec = FILES[key]
        if spec.kind == "config":
            data_assets[key] = scientific.assets.save(spec.name, spec.kind, verified_input(key))

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

    if native_request is not None:
        body = native_request.get("payload", native_request)
        for role, key in (
            ("receptor", "protein"),
            ("receptor", "receptor"),
            ("structure", "structure"),
            ("ligand", "initial"),
            ("ligand", "molecule"),
            ("ligand", "ligand"),
        ):
            reference = body.get(key)
            if isinstance(reference, dict) and reference.get("version_id"):
                objects[role] = scientific.get(reference["version_id"])
    study = study_context(capability)
    if capability == "ligandmpnn.design" and "structure" not in objects:
        study["required_materials"] = [
            (
                "先完成链 A、替代位置 A、保留参考配体的结构准备，再选择生成的 CIF。",
                "Prepare chain A with explicit alternate A and retain the reference ligand; "
                "choose the prepared CIF.",
            )
        ]

    return PreparedExample(
        module=module,
        case=case,
        objects=objects,
        data_assets=data_assets,
        sequences=sequences,
        sequence_sources=sequence_sources,
        sources=case.sources,
        request=native_request
        if native_request is not None
        else study_request(capability, objects, sequences),
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
        study=replay_context(study, capability) if native_request is not None else study,
        evidence_draft=evidence_draft(scientific, objects, measurements)
        if capability == "experimental.evidence"
        else None,
    )
