"""Example inputs use the same immutable AssetStore and ScientificStore as research."""

import hashlib
from uuid import UUID, uuid5

from ..harness_sequences import fasta_sequences
from ..research.contracts import VersionInput
from .campaign import campaign_draft
from .catalogue import CASES, FILES, MODULES, POLYMERS
from .collections import sdf_collection
from .contracts import PreparedExample
from .derived import prepared_receptor, variable_domains
from .files import verified_file
from .pins import ExamplePins
from .populations import proposal_populations
from .structure_inputs import observed_alt_a_pdb, protein_only_pdb
from .workflow import example_workflow

NAMESPACE = UUID("d2f5485c-9384-49e8-9c41-6b316a14c932")


def prepare_example(capability_id, scientific, cache, *, records=None):
    module = MODULES[capability_id]
    case = CASES[module.case_id]
    objects, data_assets = {}, {}

    def register(key, name, kind, content, source, record=0, parent=None):
        object_kind = {"structure": "structure", "ligand": "molecule", "sequences": "sequence"}[
            kind
        ]
        checksum = hashlib.sha256(content).hexdigest()
        identity = uuid5(NAMESPACE, f"{case.id}:{case.revision}:{key}:{checksum}:{record}")
        label = case.label[0] + " · " + key
        notes = "Public example revision " + str(case.revision) + "; source: " + source
        try:
            retained = scientific.get_for_key(identity)
        except KeyError:
            retained = None
        if retained is not None:
            asset = scientific.assets.get(retained.reference.asset_id)
            if (
                (asset.name, asset.kind, asset.sha256) != (name, kind, checksum)
                or (retained.kind, retained.reference.record, retained.reference.conformer)
                != (object_kind, record, 0)
                or (retained.label, retained.notes, retained.parent_id, retained.source_job)
                != (label, notes, parent.id if parent else None, None)
            ):
                raise ValueError("A fixed public input version differs from its reviewed identity.")
            with scientific.assets.path(asset).open("rb") as file:
                if hashlib.file_digest(file, "sha256").hexdigest() != checksum:
                    raise ValueError("The fixed public input file changed.")
            objects[key] = retained
            return
        asset = scientific.assets.save(name, kind, content)
        value = VersionInput(
            asset_id=asset.id,
            kind=object_kind,
            label=label,
            record=record,
            notes=notes,
            **({"parent_id": parent.id, "relation": "prepared_from"} if parent else {}),
        )
        objects[key] = scientific.create(value, identity)

    for key in case.files:
        file = FILES[key]
        if file.kind in {"config", "library", "counts", "reads"} or (
            case.id == "drugclip-public-library" and key == "egfr_library"
        ):
            from .dataset_inputs import register_dataset_input

            data_assets[key] = register_dataset_input(
                scientific.assets,
                cache,
                file,
                kind="library" if key == "egfr_library" else file.kind,
            )
            continue
        register(key, file.name, file.kind, verified_file(cache, file), file.url)
    sequences, sequence_sources = {}, {}
    if case.id in {"trastuzumab-her2", "trastuzumab-domainiv"}:
        for key, number in (("light", 1), ("heavy", 2), ("antigen", 3)):
            polymer = POLYMERS[f"1N8Z.polymer-{number}.json"]
            sequences[key] = polymer["sequence"]
        fasta = "".join(
            f">trastuzumab_{key}_1N8Z\n{sequences[key]}\n" for key in ("heavy", "light")
        )
        register(
            "antibody_chains",
            "trastuzumab-1N8Z.fasta",
            "sequences",
            fasta.encode(),
            "https://www.rcsb.org/structure/1N8Z (deposited polymer sequences)",
        )
        sequence_sources["antibody_chains"] = (sequences["heavy"], sequences["light"])
        for key in ("heavy", "light", "antigen"):
            register(
                key + "_sequence",
                "1N8Z-" + key + ".fasta",
                "sequences",
                f">1N8Z_{key}\n{sequences[key]}\n".encode(),
                "https://www.rcsb.org/structure/1N8Z (deposited polymer sequence)",
            )
            sequence_sources[key + "_sequence"] = (sequences[key],)
        domains = variable_domains(scientific, cache.parent, objects["antibody_chains"])
        if domains is not None:
            objects["variable_domains"] = domains
            sequence_sources["variable_domains"] = tuple(
                fasta_sequences(
                    scientific.assets.path(scientific.assets.get(domains.reference.asset_id))
                )
            )
        if capability_id in {"evolution", "compare"}:
            objects.update(proposal_populations(scientific, cache.parent, sequences))
        if case.id == "trastuzumab-domainiv":
            polymer = POLYMERS["6LBX.polymer-2.json"]
            sequences["antigen"] = polymer["sequence"]
            register(
                "target_construct",
                "6LBX-HER2-domain-IV.fasta",
                "sequences",
                f">6LBX_HER2_domain_IV\n{sequences['antigen']}\n".encode(),
                polymer["url"],
            )
            sequence_sources["target_construct"] = (sequences["antigen"],)
    if case.id == "brd4-jq1":
        if capability_id == "biopython.exposure":
            original = objects["brd4"]
            raw = scientific.assets.path(
                scientific.assets.get(original.reference.asset_id)
            ).read_bytes()
            register(
                "brd4_alt_a",
                "3MXF-observed-alt-A.pdb",
                "structure",
                observed_alt_a_pdb(raw),
                "https://www.rcsb.org/structure/3MXF; explicit deposited alternate A; "
                "no coordinates generated or optimized",
                parent=original,
            )
        if capability_id in {"apbs.potential", "openmm.refine"}:
            original = objects["brd4"]
            raw = scientific.assets.path(
                scientific.assets.get(original.reference.asset_id)
            ).read_bytes()
            register(
                "protein_only",
                "3MXF-protein-only-observed-alt-A.pdb",
                "structure",
                protein_only_pdb(observed_alt_a_pdb(raw)),
                "https://www.rcsb.org/structure/3MXF; deposited protein ATOM coordinates; "
                "explicit alternate A; no coordinates generated or optimized",
                parent=original,
            )
        sequences["protein"] = POLYMERS["3MXF.polymer-1.json"]["sequence"]
        register(
            "protein_sequence",
            "3MXF-BRD4.fasta",
            "sequences",
            f">3MXF_BRD4\n{sequences['protein']}\n".encode(),
            POLYMERS["3MXF.polymer-1.json"]["url"],
        )
        sequence_sources["protein_sequence"] = (sequences["protein"],)
        receptor = prepared_receptor(scientific, cache.parent, objects["brd4"])
        if receptor is not None:
            objects["receptor"] = receptor
    if case.id == "her2-repebody":
        for key, number in (("binder", 1), ("target", 2)):
            polymer = POLYMERS[f"6LBX.polymer-{number}.json"]
            sequences[key] = polymer["sequence"]
            register(
                key + "_sequence",
                "6LBX-" + key + ".fasta",
                "sequences",
                f">6LBX_{key}\n{sequences[key]}\n".encode(),
                polymer["url"],
            )
            sequence_sources[key + "_sequence"] = (sequences[key],)
    if case.id == "abl-inhibitors":
        data = sdf_collection([verified_file(cache, FILES[key]) for key in case.files])
        register(
            "library", "abl-inhibitors-three-drugs.sdf", "ligand", data, "; ".join(case.sources)
        )
    experimental = None
    if capability_id == "experimental.evidence":
        from .experimental import prepare_experimental

        experimental, asset = prepare_experimental(scientific, cache, objects["egfr_library"])
        data_assets["experimental_observations"] = asset
    pin = ExamplePins(scientific.store, cache.parent).get(capability_id, verify=True)
    request = scientific.store.get(str(pin.job_id)).request.model_dump(mode="json") if pin else None
    if capability_id == "deepternary.model" and request is None:
        from .proximity_inputs import proximity_template

        request = proximity_template(objects)
    prepared = PreparedExample(
        module=module,
        case=case,
        objects=objects,
        data_assets=data_assets,
        sequences=sequences,
        sequence_sources=sequence_sources,
        sources=case.sources,
        request=request,
        workflow_plan=example_workflow(objects) if capability_id == "workflows" else None,
        record=records.prepared(capability_id) if records is not None else None,
        source_record=records.prepared(module.parent_capability)
        if records is not None and module.parent_capability
        else None,
        campaign_draft=campaign_draft(scientific, cache.parent, objects, sequences)
        if capability_id == "campaign"
        else None,
    )

    if experimental is not None and records is not None:
        records.pin(capability_id, experimental.id, None, prepared)
        prepared = prepared.model_copy(update={"record": records.prepared(capability_id)})
    return prepared
