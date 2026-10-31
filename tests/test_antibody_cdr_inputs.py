"""Exact native numbering -> template -> immutable provenance and cold restoration."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest
from antibody_cdr_case import FIXTURE, numbering_case

from opendde_workbench.antibodies.result import AntibodyNumberResult
from opendde_workbench.examples.bundle import export_bundle, restore_bundle
from opendde_workbench.examples.bundle_archive import sha256
from opendde_workbench.examples.catalogue_profiles import historical_study_catalogue
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.antibody_cdr_inputs import interface_positions
from opendde_workbench.examples.stat6.antibody_structure_input import (
    variable_domain_atoms,
    variable_domain_pdb,
)
from opendde_workbench.examples.stat6.catalogue import MODULES, verified_input
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER

PREVIOUS = "cb530494b4f7b6113f6b6b3b6e919078b69bda46c7c1f78fb92156e05ba64cdb"


def test_native_fixture_and_deposited_coordinate_prefixes_keep_exact_identity():
    assert sha256(FIXTURE / "result.json") == (
        "4f92c1b8dcdfc657c155066e3cf6f55366b600e06c2b2b29fc9087654d352960"
    )
    value = AntibodyNumberResult.model_validate_json((FIXTURE / "result.json").read_bytes())
    sequences = {
        role: "".join(verified_input("dupilumab_" + role).decode().splitlines()[1:])
        for role in ("heavy", "light")
    }
    groups = interface_positions(value, sequences)
    assert "".join(sequences["heavy"][i] for i in groups["A"]["CDR3"]) == "AKDRLSITIRPRYYGLDV"
    assert "".join(sequences["light"][i] for i in groups["B"]["CDR3"]) == "MQALQTPYT"
    source = verified_input("dupilumab_complex")
    for chain, role in (("A", "heavy"), ("B", "light")):
        selected = variable_domain_atoms(source, sequences[role], chain)
        assert selected and all(line in source for line in selected.splitlines(keepends=True))
        with pytest.raises(ValueError, match="sequence"):
            variable_domain_atoms(source, "A" + sequences[role][1:], chain)
    # Existing search-domain output must not change under the shared selector.
    expected = (
        b"REMARK 900 6WGL HEAVY VARIABLE DOMAIN A1-125; ORIGINAL COORDINATES\n"
        b"REMARK 900 IL-4R ALPHA / STAT6 PATHWAY; NOT A DIRECT STAT6 ANTIBODY\n"
        + b"".join(
            line
            for line in source.splitlines(keepends=True)
            if line.startswith(b"ATOM  ") and line[21:22] == b"A" and 1 <= int(line[22:26]) <= 125
        )
        + b"TER\nEND\n"
    )
    assert variable_domain_pdb(source, sequences["heavy"]) == expected


@pytest.mark.parametrize("capability", ["fold", "epitope"])
def test_reviewed_native_numbering_prefills_typed_requests_and_retains_source(settings, capability):
    scientific, records, _, job, pin = numbering_case(settings)
    before = scientific.store.get(job.id).model_dump(mode="json")
    prepared = prepare_stat6(capability, scientific, records=records)
    repeated = prepare_stat6(capability, scientific, records=records)
    task = TASK_ADAPTER.validate_python(prepared.request)
    obj = prepared.objects["antibody_cdr_inputs"]
    assert obj.id == repeated.objects["antibody_cdr_inputs"].id
    assert str(obj.source_job) == job.id and obj.validation == "file_integrity_only"
    assert obj.reference in task.scientific_inputs and obj.parent_id is None
    asset = scientific.assets.get(obj.reference.asset_id)
    annotation = json.loads(scientific.assets.path(asset).read_bytes())
    assert annotation["positions"] == "zero_based_sequence_order"
    assert annotation["numbering_result_sha256"] == pin.artifact_sha256["result.json"]
    groups = annotation["cdr_regions"]
    if capability == "fold":
        assert task.payload["options"]["cdr_regions"] == {
            chain: sum(group.values(), []) for chain, group in groups.items()
        }
        assert task.payload["options"]["cdr3_positions"] == {
            chain: group["CDR3"] for chain, group in groups.items()
        }
    else:
        assert task.payload["cdr_regions"] == groups
    assert scientific.store.get(job.id).model_dump(mode="json") == before
    assert len(scientific.store.list_jobs()) == 1
    assert not prepared.study["required_materials"]


@pytest.mark.parametrize("reviewed", [False, True])
def test_missing_or_unreviewed_numbering_stays_explicit_without_computation(settings, reviewed):
    scientific, records, _, job, _ = numbering_case(settings, reviewed=reviewed)
    if reviewed:
        with scientific.store.connect() as db:
            db.execute("DELETE FROM example_pins WHERE capability_id='antibody.number'")
    for capability in ("fold", "epitope"):
        prepared = prepare_stat6(capability, scientific, records=records)
        assert prepared.request is None and "antibody_cdr_inputs" not in prepared.objects
        assert prepared.study["required_materials"]
    assert [row.id for row in scientific.store.list_jobs()] == [job.id]


@pytest.mark.parametrize("field", ["source_position", "region", "sequence"])
def test_sealed_but_inconsistent_native_annotation_is_rejected(settings, field):
    def mutate(report):
        domain = report["domains"][0]
        if field == "sequence":
            domain["sequence"] = "A" + domain["sequence"][1:]
        else:
            domain["numbering"][0][field] = 2 if field == "source_position" else "CDR1"

    scientific, records, *_ = numbering_case(settings, mutate=mutate)
    with pytest.raises(ValueError, match="inconsistent|differs"):
        prepare_stat6("fold", scientific, records=records)


def test_changed_domain_artifact_is_not_replaced_or_renumbered(settings):
    scientific, records, _, job, _ = numbering_case(settings)
    output = settings.state_dir / "jobs" / job.id / "output"
    (output / "domain-000.fasta").write_bytes(b">changed\nAAAA\n")
    with pytest.raises(ValueError, match="changed"):
        prepare_stat6("fold", scientific, records=records)


def test_numbering_only_cold_restore_prepares_same_cdr_positions_without_workers(
    settings, tmp_path
):
    scientific, records, *_ = numbering_case(settings)
    original = prepare_stat6("fold", scientific, records=records)
    target = tmp_path / "numbering.zip"
    export_bundle(settings, target, "a" * 40, capabilities=["antibody.number"], profile="stat6")
    restored = replace(settings, state_dir=tmp_path / "restored")
    restore_bundle(target, restored, sha256(target))
    from opendde_workbench.assets import AssetStore
    from opendde_workbench.examples.records import ExampleRecords
    from opendde_workbench.research.storage import ScientificStore
    from opendde_workbench.store import Store

    store = Store(restored.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, restored.state_dir / "assets")
    again = prepare_stat6(
        "fold",
        ScientificStore(store, assets),
        records=ExampleRecords(store, assets, restored, modules=MODULES),
    )
    assert again.request["payload"] == original.request["payload"]
    assert again.objects["antibody_cdr_inputs"].id == original.objects["antibody_cdr_inputs"].id
    assert len(store.list_jobs()) == 1 and store.list_jobs()[0].status == "succeeded"


def test_only_interface_module_revisions_advance_and_published_snapshots_remain_exact():
    old = historical_study_catalogue(PREVIOUS)
    for key, module in old.modules.items():
        expected = (
            module.model_copy(update={"revision": module.revision + 1})
            if key in {"fold", "epitope"}
            else module
        )
        assert MODULES[key] == expected


@pytest.mark.parametrize("capability", ["fold", "epitope"])
def test_previous_unannotated_recipe_and_gate_evidence_are_not_rewritten(settings, capability):
    scientific, records, *_ = numbering_case(settings)
    prepared = prepare_stat6(capability, scientific, records=records)
    request = json.loads(json.dumps(prepared.request))
    owner = request["payload"]["options"] if capability == "fold" else request["payload"]
    owner["cdr_regions"] = {}
    owner.pop("cdr3_positions", None)
    request["scientific_inputs"] = [
        ref
        for ref in request["scientific_inputs"]
        if ref != prepared.objects["antibody_cdr_inputs"].reference.model_dump(mode="json")
    ]
    store = scientific.store
    job = store.create(TASK_ADAPTER.validate_python(request), str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    # A controlled historical transport record, not a fabricated native fold.
    raw = b'{"protocol_fixture":true,"gate_passed":false,"cdr_contact_fraction":0}\n'
    (output / "result.json").write_bytes(raw)
    store.bind_environment(job.id, capture(settings, "opendde"))
    store.finish(job.id, Status.SUCCEEDED)
    old = historical_study_catalogue(PREVIOUS)
    previous = prepared.model_copy(update={"module": old.modules[capability]})
    pins = ExamplePins(store, settings.state_dir, modules=old.modules)
    pin = pins.pin(
        capability,
        job.id,
        previous,
        review=ExampleReview(
            interpretation="Historical transport replay fixture, without native folding.",
            limitations=(
                "Only request and artifact immutability are tested; not scientific acceptance."
            ),
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        ),
    )
    replay = prepare_stat6(capability, scientific, records=records, modules=old.modules)
    assert replay.request == request
    assert pins.get(capability, verify=True) == pin
    assert (output / "result.json").read_bytes() == raw
    assert "antibody_cdr_inputs" not in replay.objects
    assert ExamplePins(store, settings.state_dir, modules=MODULES).get(capability) is None
