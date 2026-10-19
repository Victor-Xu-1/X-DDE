"""Real public study inputs and preserved catalogue history; never a computed study result."""

import json

from opendde_workbench.assets import AssetStore
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.examples.catalogue_profiles import compatible_study_modules
from opendde_workbench.examples.stat6 import catalogue
from opendde_workbench.examples.stat6.preparation import prepare_stat6
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store
from opendde_workbench.task_history.kinds import classify_request


def test_stat6_interface_comparison_uses_deposited_same_assembly_chain_roles(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    scientific = ScientificStore(store, AssetStore(store, tmp_path / "assets"))
    prepared = prepare_stat6("rmsd", scientific)
    request = TASK_ADAPTER.validate_python(prepared.request)
    assert request.operation == "structure_compare"
    assert (
        request.reference.sha256
        == "e4a6ffaa490671b76ff5e7aa475a6011fdc0bb8889314a9c4ed92a8c49c03fdb"
    )
    assert (
        request.moving.sha256 == "4ce400d25293e6926fe4c3ea58dcd5e28e98393d295a13e2b2362aada78fe073"
    )
    assert request.options.purpose == "conformational_comparison"
    assert request.options.target_mapping[0].model_dump() == {"reference": "A", "moving": "A"}
    assert request.options.partner_mapping[0].model_dump() == {"reference": "B", "moving": "C"}
    assert request.options.correspondence == "author_numbering"
    assert "https://data.rcsb.org/rest/v1/core/assembly/4Y5W/1" in prepared.case.sources
    assert request.scientific_inputs == [request.reference, request.moving]
    assert store.list_jobs() == []
    assert prepare_stat6("rmsd", scientific).request == prepared.request
    assert CAPABILITIES["rmsd"].environment == "biopython"
    assert CAPABILITIES["rmsd"].native_tool is None
    assert classify_request(request.model_dump(mode="json")) == "rmsd"
    assert classify_request({"operation": "harness", "tool": "rmsd"}) == "rmsd"


def test_added_public_input_preserves_every_reviewed_stat6_bundle_profile():
    profiles = json.loads((catalogue.ROOT / "catalogue-profiles.json").read_bytes())
    assert len(profiles) >= 6
    for digest, metadata in profiles.items():
        assert set(compatible_study_modules(digest)) == set(metadata["module_ids"])
