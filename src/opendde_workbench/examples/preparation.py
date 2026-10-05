"""Example inputs use the same immutable AssetStore and ScientificStore as research."""

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
from .structure_inputs import protein_only_pdb
from .workflow import example_workflow

NAMESPACE = UUID("d2f5485c-9384-49e8-9c41-6b316a14c932")


def prepare_example(capability_id, scientific, cache, *, records=None):
    module = MODULES[capability_id]
    case = CASES[module.case_id]
    objects = {}

    def register(key, name, kind, content, source, record=0):
        asset = scientific.assets.save(name, kind, content)
        object_kind = {"structure": "structure", "ligand": "molecule", "sequences": "sequence"}[
            kind
        ]
        value = VersionInput(
            asset_id=asset.id,
            kind=object_kind,
            label=case.label[0] + " · " + key,
            record=record,
            notes="Public example revision " + str(case.revision) + "; source: " + source,
        )
        identity = f"{case.id}:{case.revision}:{key}:{asset.sha256}:{record}"
        objects[key] = scientific.create(value, uuid5(NAMESPACE, identity))

    for key in case.files:
        file = FILES[key]
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
        if capability_id in {"apbs.potential", "openmm.refine"}:
            original = objects["brd4"]
            raw = scientific.assets.path(
                scientific.assets.get(original.reference.asset_id)
            ).read_bytes()
            asset = scientific.assets.save(
                "3MXF-protein-only.pdb", "structure", protein_only_pdb(raw)
            )
            objects["protein_only"] = scientific.create(
                VersionInput(
                    asset_id=asset.id,
                    kind="structure",
                    label="BRD4 · protein-only input",
                    parent_id=original.id,
                    relation="prepared_from",
                    notes=(
                        "Original deposited ATOM coordinates only; "
                        "no modeled atoms, charges or optimization."
                    ),
                ),
                uuid5(NAMESPACE, "protein-only:" + asset.sha256),
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
    pin = ExamplePins(scientific.store, cache.parent).get(capability_id, verify=True)
    request = scientific.store.get(str(pin.job_id)).request.model_dump(mode="json") if pin else None
    return PreparedExample(
        module=module,
        case=case,
        objects=objects,
        sequences=sequences,
        sequence_sources=sequence_sources,
        sources=case.sources,
        request=request,
        workflow_plan=example_workflow(objects) if capability_id == "workflows" else None,
        record=records.prepared(capability_id) if records is not None else None,
        campaign_draft=campaign_draft(scientific, cache.parent, objects, sequences)
        if capability_id == "campaign"
        else None,
    )
