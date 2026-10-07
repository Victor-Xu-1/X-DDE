"""Install source-backed experimental case data without launching scientific inference."""

from ..assets import AssetStore
from ..examples.preparation import prepare_example
from ..examples.records import ExampleRecords
from ..research.storage import ScientificStore
from ..settings import Settings
from ..store import Store


def install(root, state, report, checkpoint):
    if state is None:
        raise ValueError("Experimental cases require the current X-DDE scientific state.")
    checkpoint()
    settings = Settings(
        state_dir=state,
        image_file=state / "managed-references/image",
        code_file=state / "managed-references/code",
        model_dir=root / "models/opendde",
        cache_dir=state / "cache",
    )
    store = Store(state / "jobs.sqlite3")
    assets = AssetStore(store, state / "assets")
    records = ExampleRecords(store, assets, settings)
    report("Verifying the original published experimental source and fixed record")
    value = prepare_example(
        "experimental.evidence",
        ScientificStore(store, assets),
        state / "public-example-cache",
        records=records,
    )
    checkpoint()
    record = records.get("experimental.evidence", verify=True)
    if value.record is None or record is None:
        raise ValueError("The fixed experimental record was not verified.")
    return {
        "case_revision": 1,
        "record_id": str(record.record_id),
        "observations": len(value.record["value"]["observations"]),
        "source_kind": "reported_experimental_observations",
        "fixed_source_sha256": value.objects["egfr_library"].reference.sha256,
        "scientific_inference": False,
    }
