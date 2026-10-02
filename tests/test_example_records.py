"""Compound reference integrity boundaries; controlled protocol fixtures, not R&D output."""

import json
from uuid import uuid4

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.catalogue import CASES, MODULES
from opendde_workbench.examples.contracts import PreparedExample
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.execution_environment import capture
from opendde_workbench.models import Status
from opendde_workbench.requests import TASK_ADAPTER
from opendde_workbench.research.contracts import VersionInput
from opendde_workbench.research.regions import RegionInput, RegionRecords
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import ConflictError, Store


def fixture(settings):
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    asset = assets.save("protocol-boundary.sdf", "ligand", b"Protocol boundary fixture\n$$$$\n")
    molecule = scientific.create(
        VersionInput(asset_id=asset.id, kind="molecule", label="Protocol fixture"), uuid4()
    )
    job = store.create(
        TASK_ADAPTER.validate_python(
            {
                "operation": "diffsbdd",
                "name": "protocol identity",
                "payload": {
                    "mode": "identity",
                    "molecule": molecule.reference.model_dump(mode="json"),
                },
            }
        ),
        str(uuid4()),
        20,
        500,
    )
    store.claim(job.id)
    store.bind_environment(job.id, capture(settings, "diffsbdd"))
    store.finish(job.id, Status.SUCCEEDED)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    (output / "result.json").write_text(
        json.dumps(
            {
                "mode": "identity",
                "complete": True,
                "identity_basis": "rdkit_removeHs_record_order",
                "reference": molecule.reference.model_dump(mode="json"),
                "atoms": [{"index": i, "element": "C", "selectable": True} for i in range(3)],
            }
        )
    )
    records = RegionRecords(store, assets, settings)
    body = RegionInput.model_validate(
        {
            "name": "Protocol region",
            "subject": molecule.reference,
            "identity_job": job.id,
            "regions": [{"name": "Protocol selection", "role": "custom", "atom_indices": [0, 1]}],
        }
    )
    record = records.save(body, uuid4())
    prepared = PreparedExample(
        module=MODULES["regions"],
        case=CASES["mz1-ternary"],
        objects={"mz1_molecule": molecule},
        sequences={},
        sources=(),
    )
    return ExampleRecords(store, assets, settings), prepared, record, records, body, output


def test_fixed_region_reference_is_immutable_and_requires_unchanged_native_identity(settings):
    pins, prepared, record, regions, body, output = fixture(settings)
    pin = pins.pin("regions", record["id"], None, prepared)
    assert pins.pin("regions", record["id"], None, prepared) == pin
    assert pins.get("regions", verify=True) == pin
    assert pins.prepared("regions")["value"]["body"] == record["body"]
    other = regions.save(body.model_copy(update={"name": "Another selection"}), uuid4())
    with pytest.raises(ConflictError, match="immutable"):
        pins.pin("regions", other["id"], None, prepared)
    (output / "result.json").write_text('{"changed":true}')
    with pytest.raises(ValueError, match="output bytes changed"):
        pins.get("regions", verify=True)


def test_region_case_cannot_reference_another_molecular_version(settings):
    pins, prepared, record, _, _, _ = fixture(settings)
    other = prepared.objects["mz1_molecule"].model_copy(
        update={
            "reference": prepared.objects["mz1_molecule"].reference.model_copy(update={"record": 1})
        }
    )
    with pytest.raises(ValueError, match="exact public MZ1"):
        pins.pin(
            "regions",
            record["id"],
            None,
            prepared.model_copy(update={"objects": {"mz1_molecule": other}}),
        )
