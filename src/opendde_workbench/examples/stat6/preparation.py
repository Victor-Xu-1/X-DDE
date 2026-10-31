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


def prepare_stat6(capability, scientific, *, records=None, modules=MODULES):
    module = modules[capability]
    case = case_for(capability)
    native_request = reviewed_request(capability, scientific, records, modules=modules)
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
    if capability in {"boltz.predict", "predict"}:
        from .prediction_inputs import reviewed_prediction_inputs

        prediction_inputs = reviewed_prediction_inputs(scientific, records, sequence)
        if prediction_inputs is not None:
            objects.update(prediction_inputs["objects"])
            objects["protein_sequence"] = objects["prediction_construct"]
            sequences["protein"] = prediction_inputs["sequence"]
    if capability in {"boltz.predict", "predict", "mpnn", "esm2", "boltzgen.design"}:
        from .domain_inputs import reviewed_domain_inputs

        domain = reviewed_domain_inputs(
            scientific, records, sequence, register_input(scientific, "stat6_predicted_construct")
        )
        if domain is not None:
            objects.update(domain["objects"])
            sequences["sh2"] = domain["sequence"]
            if capability in {"boltz.predict", "predict"}:
                objects["prediction_construct"] = objects["sh2_sequence"]
                objects["protein_sequence"] = objects["sh2_sequence"]
                objects["prediction_msa"] = objects["sh2_msa"]
                sequences["protein"] = domain["sequence"]
    if capability in {"evolution", "compare"}:
        from .sequence_populations import reviewed_sequence_populations

        objects.update(reviewed_sequence_populations(scientific, records, sequence))
    if capability in {
        "antibody.humanize",
        "antibody.number",
        "fold",
        "epitope",
        "campaign",
        "protrek-structure",
    }:
        sequences["antigen"] = "".join(
            verified_input("dupilumab_antigen").decode().splitlines()[1:]
        )
        objects["antigen_sequence"] = originals["dupilumab_antigen"]
        objects["structure"] = originals["dupilumab_complex"]
    if capability == "protrek-structure":
        from .antibody_structure_input import reviewed_antibody_structure

        domain = reviewed_antibody_structure(scientific, originals["dupilumab_complex"])
        objects["receptor"] = domain
        objects["structure"] = domain
    antibody = None
    if capability in {"fold", "epitope"} and native_request is None:
        from .antibody_cdr_inputs import reviewed_antibody_cdr
        from .antibody_structure_input import variable_domain_atoms

        antibody = reviewed_antibody_cdr(
            scientific, records, objects["variable_domains"], sequences
        )
        if antibody is not None:
            if capability == "epitope":
                for chain, role in (("A", "heavy"), ("B", "light")):
                    variable_domain_atoms(
                        verified_input("dupilumab_complex"), sequences[role], chain
                    )
            objects["antibody_cdr_inputs"] = antibody["object"]
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
    sequence_sources["protein_sequence"] = (sequences["protein"],)
    if "sh2_sequence" in objects:
        sequence_sources["sh2_sequence"] = (sequences["sh2"],)
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
    if capability in {"fold", "epitope"} and native_request is None and antibody is None:
        study = {
            **study,
            "required_materials": [
                (
                    "先完成并核对这对可变域的抗体编号，再加载完整 CDR 注释。",
                    "Complete and review native numbering of these variable domains "
                    "before loading their CDR annotations.",
                )
            ],
        }
    if capability in {"evolution", "compare"} and "proposal_history" in objects:
        study = {
            **study,
            "required_materials": [],
            "guide": {
                **study["guide"],
                "steps": [
                    (
                        "核对已评分的野生型和单点假设来源。",
                        "Review the scored parent and single-site hypothesis sources.",
                    ),
                    (
                        "核对负 PLL 损失及越低越好的比较方向。",
                        "Review negative PLL loss and its lower-is-better direction.",
                    ),
                    (
                        "命名本次比较；不把序列评分当作亲和力。",
                        "Name this comparison; sequence scores are not affinity.",
                    ),
                    (
                        "提交分析并核对各候选、分支与原始分数。",
                        "Submit the analysis and inspect candidates, paths and original scores.",
                    ),
                ],
                "interpretation": (
                    "比较同一序列模型已评分的野生型与单点假设；"
                    "负 PLL 为损失，越低越好。没有亲和力、结构或药效结论。",
                    "Compare the scored parent and single-site hypotheses from one sequence model. "
                    "Negative PLL is the loss; lower is better. "
                    "No affinity, folding or activity result is implied.",
                ),
            },
        }
    workflow_plan = None
    if capability == "workflows":
        from .workflow_replay import study_workflow

        workflow_plan = study_workflow(scientific, records, modules=modules)
        if workflow_plan is not None:
            study = {**study, "required_materials": []}
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
        workflow_plan=workflow_plan,
        request=native_request
        if native_request is not None
        else study_request(capability, objects, sequences, antibody=antibody),
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
        study=replay_context(study, capability, native_request)
        if native_request is not None
        else study,
        evidence_draft=evidence_draft(scientific, objects, measurements)
        if capability == "experimental.evidence"
        else None,
    )
