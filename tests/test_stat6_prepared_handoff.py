"""Native preparation lineage handoff; no scientific computation in these fixtures."""

import hashlib
import json
from uuid import uuid4

import pytest

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.contracts import ExampleReview
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def preparation_fixture(settings, *, source_matches=True, protein_only=False):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    prepared = prepare_stat6("biopython.prepare", scientific, records=records)
    if protein_only:
        prepared.request["options"].update(format="pdb", heterogens="remove")
    request = TASK_ADAPTER.validate_python(prepared.request)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    # Only a transport fixture, never a distributed native chemical result.
    raw = b"data_controlled_archive_handoff_fixture\n"
    digest = hashlib.sha256(raw).hexdigest()
    artifact = "prepared." + request.options.format
    (output / artifact).write_bytes(raw)
    report = {
        "operation": "structure_prepare",
        "complete": True,
        "schema_version": 1,
        "source": request.structure.model_dump(mode="json"),
        "options": request.options.model_dump(mode="json"),
        "artifact": artifact,
        "sha256": digest,
        "atom_count": 3,
        "inspection": {
            "model_count": 1,
            "selected_chains": ["A"],
            "parser_warnings": [],
            "parser_warnings_truncated": False,
        },
        "removed_residues": [],
        "resolved_alternates": [],
        "versions": {"biopython": "1.88"},
        "coordinate_frame": "source_coordinates_selected_model",
        "coordinate_unit": "angstrom",
        "scope": "observed_selection_and_format_export_not_chemical_preparation",
        "unobserved_atoms": "not_generated",
        "biological_assembly": "provided_coordinates_only",
    }
    if not source_matches:
        report["source"]["sha256"] = "0" * 64
    (output / "result.json").write_text(json.dumps(report))
    store.bind_environment(job.id, capture(settings, "biopython"))
    store.finish(job.id, Status.SUCCEEDED)
    asset = assets.save(artifact, "structure", raw)
    version = scientific.create(
        VersionInput(
            asset_id=asset.id,
            kind="structure",
            label="Protocol handoff fixture",
            parent_id=request.structure.version_id,
            relation="prepared_from",
        ),
        uuid4(),
        source_job=job.id,
    )
    ExamplePins(store, settings.state_dir, modules=MODULES).pin(
        "biopython.prepare",
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Controlled lineage and archive fixture; no inference was performed.",
            limitations="This fixture tests exact source identity and does not establish geometry.",
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        ),
    )
    return store, scientific, records, version


def docking_fixture(settings):
    store, scientific, records, version = preparation_fixture(settings, protein_only=True)
    prepared = prepare_stat6("gnina.dock", scientific, records=records)
    receptor = version.reference.model_dump(mode="json")
    ligand = prepared.objects["ligand"].reference.model_dump(mode="json")
    reference = prepared.objects["pocket_reference"].reference.model_dump(mode="json")
    request = TASK_ADAPTER.validate_python(
        {
            "operation": "docking",
            "name": "Controlled prepared-receptor handoff fixture",
            "mode": "dock",
            "receptor": receptor,
            "ligand": ligand,
            "search": {
                "kind": "reference_ligand",
                "frame": receptor,
                "reference": reference,
                "coordinate_basis": "user_confirmed",
            },
            "options": {"cpu": 1, "cnn_scoring": "none", "use_gpu": False},
        }
    )
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text('{"controlled_transport_fixture":true}')
    store.bind_environment(job.id, capture(settings, "gnina"))
    store.finish(job.id, Status.SUCCEEDED)
    ExamplePins(store, settings.state_dir, modules=MODULES).pin(
        "gnina.dock",
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Transport-only fixture of reviewed docking input lineage.",
            limitations="No scientific pose or binding validation was performed by this fixture.",
            checked=(
                "input_identity",
                "method_scope",
                "native_outputs",
                "visual_preview",
                "downloads",
            ),
        ),
    )
    return store, scientific, records, version


def test_cold_docking_template_requires_explicit_preparation_without_starting_jobs(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    prepared = prepare_stat6("gnina.dock", scientific)
    assert prepared.request is None and "receptor" not in prepared.objects
    assert "stat6_structure" in prepared.objects and "pocket_reference" in prepared.objects
    assert prepared.study["required_materials"] and not store.list_jobs()


def test_electrostatic_template_requires_qualified_protein_and_reuses_exact_reviewed_version(
    settings,
):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    cold = prepare_stat6("apbs.potential", scientific)
    assert cold.request is None
    assert "receptor" not in cold.objects and "protein_only" not in cold.objects
    assert not store.list_jobs()
    store, scientific, records, version = docking_fixture(settings)
    before = len(store.list_jobs())
    ready = prepare_stat6("apbs.potential", scientific, records=records)
    assert ready.objects["receptor"] == ready.objects["protein_only"] == version
    assert ready.request["inputs"][0]["source"] == version.reference.model_dump(mode="json")
    assert len(store.list_jobs()) == before


def test_docking_template_uses_its_exact_reviewed_prepared_version(settings):
    store, scientific, records, version = docking_fixture(settings)
    before = len(store.list_jobs())
    # A newer same-named output is not the reviewed docking source.
    scientific.create(
        VersionInput(asset_id=version.reference.asset_id, kind="structure", label="Later copy"),
        uuid4(),
        source_job=version.source_job,
    )
    prepared = prepare_stat6("gnina.dock", scientific, records=records)
    assert prepared.objects["receptor"] == version
    ref = version.reference.model_dump(mode="json")
    assert prepared.request["receptor"] == prepared.request["search"]["frame"] == ref
    assert prepared.request["search"]["reference"] == prepared.objects[
        "pocket_reference"
    ].reference.model_dump(mode="json")
    assert len(store.list_jobs()) == before


def test_generation_template_requires_exact_prepared_receptor_and_matching_reference_frame(
    settings,
):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    cold = prepare_stat6("diffsbdd.generate", scientific)
    assert cold.request is None and "receptor" not in cold.objects
    assert "pocket_reference" in cold.objects and not store.list_jobs()
    store, scientific, records, version = docking_fixture(settings)
    before = len(store.list_jobs())
    ready = prepare_stat6("diffsbdd.generate", scientific, records=records)
    assert ready.request["payload"]["protein"] == version.reference.model_dump(mode="json")
    assert ready.request["payload"]["pocket"]["ligand"] == ready.objects[
        "pocket_reference"
    ].reference.model_dump(mode="json")
    assert ready.request["payload"]["initial"] is None
    assert ready.request["payload"]["options"]["steps"] == 500
    assert len(store.list_jobs()) == before


def test_diff_receptor_template_uses_the_qualified_pdb_without_a_cif_alias(settings):
    store, scientific, records, version = docking_fixture(settings)
    before = len(store.list_jobs())
    prepared = prepare_stat6("diffsbdd.prepare", scientific, records=records)
    assert prepared.objects["structure"] == prepared.objects["receptor"] == version
    payload = prepared.request["payload"]
    assert payload["protein"] == version.reference.model_dump(mode="json")
    assert payload["chains"] == ["A"] and payload["remove_water"] is True
    assert payload["keep_ligands"] is False and payload["remove_hydrogens"] is False
    assert prepared.objects["stat6_structure"].reference != version.reference
    assert len(store.list_jobs()) == before


def test_cold_diff_receptor_template_does_not_prefill_an_unsupported_cif(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    prepared = prepare_stat6("diffsbdd.prepare", scientific)
    assert prepared.request is None
    assert "structure" not in prepared.objects and "receptor" not in prepared.objects
    assert "stat6_structure" in prepared.objects and "stat6_receptor" in prepared.objects
    assert prepared.study["required_materials"] and not store.list_jobs()


@pytest.mark.parametrize("failure", ["artifact", "options", "source"])
def test_docking_template_rejects_changed_preparation_instead_of_raw_fallback(settings, failure):
    _, scientific, records, version = docking_fixture(settings)
    output = settings.state_dir / "jobs" / str(version.source_job) / "output"
    if failure == "artifact":
        (output / "prepared.pdb").write_text("Changed after native preparation\n")
    else:
        path = output / "result.json"
        report = json.loads(path.read_text())
        if failure == "options":
            report["options"]["alternate"] = "B"
        else:
            report["source"]["sha256"] = "0" * 64
        path.write_text(json.dumps(report))
    with pytest.raises(ValueError):
        prepare_stat6("gnina.dock", scientific, records=records)


def test_raw_alternate_locations_are_not_prefilled_as_a_ready_exposure_task(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    prepared = prepare_stat6("biopython.exposure", scientific)
    assert prepared.request is None and "receptor" not in prepared.objects
    assert prepared.study["required_materials"]
    assert "stat6_structure" in prepared.objects and not store.list_jobs()


def test_channel_template_uses_retained_reference_site_in_the_reviewed_cif(settings):
    store, scientific, records, native = preparation_fixture(settings)
    before = len(store.list_jobs())
    result = prepare_stat6("caver.paths", scientific, records=records)
    assert result.request["structure"] == native.reference.model_dump(mode="json")
    assert result.request["starting_regions"] == [
        {"chain": "A", "number": 701, "insertion_code": "", "resname": "A1AQQ"}
    ]
    assert result.request["options"]["context_chains"] == ["A"]
    assert result.request["options"]["remove_starting_ligands"] is True
    assert result.request["options"]["cpu"] == 1
    assert len(store.list_jobs()) == before


@pytest.mark.parametrize("capability", ["caver.paths", "ligandmpnn.design"])
def test_ligand_context_templates_reject_a_protein_only_export(settings, capability):
    _, scientific, records, _ = preparation_fixture(settings, protein_only=True)
    with pytest.raises(ValueError, match="retaining the reference ligand"):
        prepare_stat6(capability, scientific, records=records)


@pytest.mark.parametrize(
    ("capability", "role"), [("caver.paths", "receptor"), ("ligandmpnn.design", "structure")]
)
def test_cold_ligand_context_templates_do_not_prefill_an_unreviewed_structure(
    settings, capability, role
):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    result = prepare_stat6(capability, scientific)
    assert result.request is None and role not in result.objects
    assert result.study["required_materials"] and not store.list_jobs()


def test_ligandmpnn_template_uses_exact_prepared_ligand_context_without_phantom_prerequisites(
    settings,
):
    store, scientific, records, native = preparation_fixture(settings)
    before = len(store.list_jobs())
    prepared = prepare_stat6("ligandmpnn.design", scientific, records=records)
    assert prepared.objects["structure"] == native
    assert prepared.request["inputs"] == [
        {"role": "structure", "source": native.reference.model_dump(mode="json")}
    ]
    assert prepared.request["payload"]["redesigned_residues"] == ["A614"]
    assert prepared.request["payload"]["pack_sidechains"] is True
    assert prepared.request["payload"]["candidates"] == 8
    assert not prepared.study["required_materials"]
    assert len(store.list_jobs()) == before


def test_ensemble_requires_the_exact_reviewed_reference_preparation(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    pending = prepare_stat6("biopython.ensemble", scientific)
    assert pending.request is None and "receptor_a" not in pending.objects
    assert "receptor_b" in pending.objects and not store.list_jobs()

    store, scientific, records, native = preparation_fixture(settings)
    before = len(store.list_jobs())
    ready = prepare_stat6("biopython.ensemble", scientific, records=records)
    assert ready.objects["receptor_a"] == native
    assert ready.request["inputs"][0]["structure"] == native.reference.model_dump(mode="json")
    assert all(item["selection"]["profile"] == "experimental" for item in ready.request["inputs"])
    assert len(store.list_jobs()) == before


def test_reviewed_preparation_is_reused_by_exact_source_and_result_identity(settings):
    store, scientific, records, native = preparation_fixture(settings)
    before = len(store.list_jobs())
    result = prepare_stat6("biopython.exposure", scientific, records=records)
    assert result.objects["receptor"] == native
    assert result.request["structure"] == native.reference.model_dump(mode="json")
    assert result.request["regions"] == [
        {"chain": "A", "number": 614, "insertion_code": "", "resname": "ASN"}
    ]
    assert len(store.list_jobs()) == before
    assert (
        prepare_stat6("biopython.exposure", scientific, records=records).request == result.request
    )


def test_mismatched_source_cannot_silently_supply_a_native_receptor(settings):
    _, scientific, records, _ = preparation_fixture(settings, source_matches=False)
    with pytest.raises(ValueError, match="does not belong"):
        prepare_stat6("biopython.exposure", scientific, records=records)


def test_missing_or_ambiguous_registered_output_does_not_choose_another_file(settings):
    _, scientific, records, native = preparation_fixture(settings)
    scientific.create(
        VersionInput(asset_id=native.reference.asset_id, kind="structure", label="Another version"),
        uuid4(),
        source_job=native.source_job,
    )
    with pytest.raises(ValueError, match="one exact native result"):
        prepare_stat6("biopython.exposure", scientific, records=records)
