"""The released STAT6-state example must retain its real display and reusable inputs."""

import hashlib
import json
import math
from dataclasses import replace

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples import stat6_bundle_release as spec
from opendde_workbench.examples.bundle import export_bundle, restore_bundle
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from opendde_workbench.structure_comparison.presentation import present_comparison


def retained_comparison(settings, store, assets, tmp_path):
    pins = ExamplePins(store, settings.state_dir, modules=MODULES)
    pin = pins.get("rmsd", verify=True)
    assert str(pin.job_id) == "0f2b0361-94af-4fe6-a4a8-62bbc80ca196"
    assert pin.review and "functional states" in pin.review.limitations
    job = store.get(str(pin.job_id))
    assert job.request.operation == "structure_compare"
    assert job.request.options.purpose == "conformational_comparison"
    assert job.request.options.correspondence == "author_numbering"
    assert [(v.reference, v.moving) for v in job.request.options.target_mapping] == [("A", "A")]
    assert [(v.reference, v.moving) for v in job.request.options.partner_mapping] == [("B", "C")]
    scientific = ScientificStore(store, assets)
    for reference in (job.request.reference, job.request.moving):
        scientific.validate_reference(reference)
    output = settings.state_dir / "jobs" / job.id / "output"
    value = json.loads((output / "result.json").read_bytes())
    display = present_comparison(value, job, output, store, assets)
    geometry = display["geometry"]
    assert (geometry["matched_target_ca"], geometry["matched_partner_ca"]) == (441, 433)
    assert math.isclose(geometry["target_rmsd_angstrom"], 1.8030361426324968, abs_tol=1e-8)
    assert math.isclose(geometry["partner_rmsd_angstrom"], 23.7409554764684, abs_tol=1e-8)
    assert display["coordinate_frame"] == "selected_reference_source"
    metrics = display["native_quality"]["interfaces"][0]["metrics"]
    assert (metrics["nat_correct"], metrics["nat_total"], metrics["model_total"]) == (76, 95, 81)
    assert metrics["fnat"] == 0.8 and display["native_quality"]["quality_grade"] is None
    assert display["versions"] == {"biopython": "1.88", "numpy": "1.26.4", "dockq": "2.1.3"}
    assert [len(row["polymer"]["modified_residues"]) for row in display["inspections"]] == [2, 2]
    assert {
        (row["chain"], row["number"], row["residue"], row["parent"])
        for inspection in display["inspections"]
        for row in inspection["polymer"]["modified_residues"]
    } == {("A", 641, "PTR", "TYR"), ("B", 641, "PTR", "TYR"), ("C", 641, "PTR", "TYR")}
    assert display["artifact_sha256"]["reference-source.cif"] == (
        "e4a6ffaa490671b76ff5e7aa475a6011fdc0bb8889314a9c4ed92a8c49c03fdb"
    )
    assert display["artifact_sha256"]["moving-source.cif"] == (
        "4ce400d25293e6926fe4c3ea58dcd5e28e98393d295a13e2b2362aada78fe073"
    )
    for name, expected in display["artifact_sha256"].items():
        assert hashlib.sha256((output / name).read_bytes()).hexdigest() == expected
    original_request = pins.request("rmsd", reviewed=True)
    destination = tmp_path / "comparison-only.zip"
    exported = export_bundle(
        settings, destination, spec.SOURCE_REVISION, capabilities=["rmsd"], profile="stat6"
    )
    isolated = replace(settings, state_dir=tmp_path / "comparison-only-replay")
    assert restore_bundle(destination, isolated, exported["sha256"])["computed"] == 1
    restored_store = Store(isolated.state_dir / "jobs.sqlite3")
    restored_assets = AssetStore(restored_store, isolated.state_dir / "assets")
    restored_pins = ExamplePins(restored_store, isolated.state_dir, modules=MODULES)
    assert restored_pins.request("rmsd", reviewed=True) == original_request
    restored_job = restored_store.get(job.id)
    restored_output = isolated.state_dir / "jobs" / job.id / "output"
    restored_display = present_comparison(
        json.loads((restored_output / "result.json").read_bytes()),
        restored_job,
        restored_output,
        restored_store,
        restored_assets,
    )
    assert restored_display["geometry"] == geometry
    for reference in (restored_job.request.reference, restored_job.request.moving):
        ScientificStore(restored_store, restored_assets).validate_reference(reference)
    return {
        "job": job.id,
        "same_frame_CA": [441, 433],
        "conserved_reference_contacts": [76, 95],
        "native_reports_retained": len(display["artifact_sha256"]),
        "sealed_request_and_real_presenter_replayed": True,
        "new_scientific_tasks": 0,
    }
