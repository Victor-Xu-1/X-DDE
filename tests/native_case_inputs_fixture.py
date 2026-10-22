"""Sealed transport fixtures; these files never represent actual scientific computation."""

import json
from uuid import uuid4

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
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.store import Store


def stores(settings):
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    return (
        store,
        ScientificStore(store, assets),
        ExampleRecords(store, assets, settings, modules=MODULES),
    )


def retain(settings, store, scientific, records, capability, request, files):
    prepared = prepare_stat6(capability, scientific, records=records)
    job = store.create(TASK_ADAPTER.validate_python(request), str(uuid4()), 20, 500)
    store.claim(job.id)
    output = settings.state_dir / "jobs" / job.id / "output"
    output.mkdir(parents=True)
    for name, content in files.items():
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else json.dumps(content).encode())
    store.bind_environment(job.id, capture(settings, "opendde"))
    store.finish(job.id, Status.SUCCEEDED)
    ExamplePins(store, settings.state_dir, modules=MODULES).pin(
        capability,
        job.id,
        prepared,
        review=ExampleReview(
            interpretation="Sealed input-authority transport fixture, not a scientific result.",
            limitations=(
                "No inference, alignment search, prediction or scientific acceptance occurred."
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
    return job, output


def prediction_sources(settings):
    store, scientific, records = stores(settings)
    prepared = prepare_stat6("import", scientific, records=records)
    canonical = prepared.sequences["protein"]
    construct = canonical[112:658]
    imported, _ = retain(
        settings,
        store,
        scientific,
        records,
        "import",
        {
            "operation": "json",
            "name": "Controlled native conversion fixture",
            "altloc": "A",
            "assets": [str(prepared.objects["stat6_structure"].reference.asset_id)],
        },
        {
            "result.json": {"operation": "json", "complete": True, "documents": ["converted.json"]},
            "converted.json": [
                {"sequences": [{"proteinChain": {"sequence": construct, "count": 1}}]}
            ],
        },
    )
    feature = prepare_stat6("features", scientific, records=records)
    request = {
        "operation": "mt",
        "name": "Controlled native feature fixture",
        "components": [{"kind": "protein", "value": canonical}],
        "scientific_inputs": [
            feature.objects["protein_sequence"].reference.model_dump(mode="json")
        ],
        "parameters": {"feature_mode": "search", "allow_network": True, "use_template": True},
    }
    unpaired = (
        f">query\n{canonical}\n>local\n{canonical[:613]}A{canonical[614:]}\n"
        f">outside\n{canonical[:100]}{'-' * 747}\n"
    ).encode()
    protein = {
        "sequence": canonical,
        "count": 1,
        "unpairedMsaPath": "/job/output/msa/non_pairing.a3m",
    }
    features, output = retain(
        settings,
        store,
        scientific,
        records,
        "features",
        request,
        {
            "result.json": {
                "operation": "mt",
                "complete": True,
                "documents": ["prepared-input.json"],
            },
            "prepared-input.json": [{"sequences": [{"proteinChain": protein}]}],
            "msa/non_pairing.a3m": unpaired,
        },
    )
    return store, scientific, records, canonical, imported, features, output


def scored_sources(settings):
    store, scientific, records = stores(settings)
    prepared = prepare_stat6("esm", scientific, records=records)
    parent = prepared.sequences["protein"]
    assert parent[613] == "N"
    sequences = [parent, parent[:613] + "A" + parent[614:], parent[:613] + "Q" + parent[614:]]
    request = {
        **prepared.request,
        "payload": {**prepared.request["payload"], "sequences": sequences},
    }
    job, output = retain(
        settings,
        store,
        scientific,
        records,
        "esm",
        request,
        {
            "result.json": {
                "operation": "harness",
                "complete": True,
                "tool": "esm",
                "result": {"scores": [-1.0, -1.1, -1.2]},
            }
        },
    )
    return store, scientific, records, parent, job, output
