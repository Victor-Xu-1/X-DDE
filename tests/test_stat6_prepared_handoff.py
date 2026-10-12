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


def preparation_fixture(settings, *, source_matches=True):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings, modules=MODULES)
    prepared = prepare_stat6("biopython.prepare", scientific, records=records)
    request = TASK_ADAPTER.validate_python(prepared.request)
    job = store.create(request, str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    # Only a transport fixture, never a distributed native chemical result.
    raw = b"data_controlled_archive_handoff_fixture\n"
    digest = hashlib.sha256(raw).hexdigest()
    (output / "prepared.cif").write_bytes(raw)
    report = {
        "operation": "structure_prepare",
        "complete": True,
        "schema_version": 1,
        "source": request.structure.model_dump(mode="json"),
        "options": request.options.model_dump(mode="json"),
        "artifact": "prepared.cif",
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
    asset = assets.save("prepared.cif", "structure", raw)
    version = scientific.create(
        VersionInput(asset_id=asset.id, kind="structure", label="Protocol handoff fixture"),
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


def test_raw_alternate_locations_are_not_prefilled_as_a_ready_exposure_task(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, settings.state_dir / "assets"))
    prepared = prepare_stat6("biopython.exposure", scientific)
    assert prepared.request is None and "receptor" not in prepared.objects
    assert prepared.study["required_materials"]
    assert "stat6_structure" in prepared.objects and not store.list_jobs()


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
