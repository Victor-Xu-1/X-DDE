"""Merge only successful public native receipts and pin their retained bytes without computation."""

import argparse
import json
import shutil
import sqlite3
from pathlib import Path

from opendde_workbench.api import create_app
from opendde_workbench.assets import AssetStore
from opendde_workbench.examples.bundle import export_bundle
from opendde_workbench.examples.bundle_projection import TABLES
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.preparation import prepare_example
from opendde_workbench.examples.records import ExampleRecords
from opendde_workbench.research.storage import ScientificStore
from opendde_workbench.settings import Settings
from opendde_workbench.store import Store

OPERATIONS = {
    "library.import": "library_prepare",
    "library.select": "library_subset",
    "drugclip.index": "drugclip_index",
    "drugclip.screen": "drugclip_retrieve",
    "screening.dock": "screening_dock",
    "del.library": "del_validate",
    "del.enumerate": "del_enumerate",
    "del.decode": "del_decode",
    "del.count": "del_count",
    "del.analyze": "del_analyze",
    "del.series": "del_series",
    "del.model": "del_model",
    "del.candidates": "del_candidates",
    "del.followup": "del_followup",
}


def merge(source, state, store):
    with sqlite3.connect(source / "jobs.sqlite3") as origin, store.connect() as destination:
        origin.row_factory = sqlite3.Row
        for table in TABLES:
            if table in {"example_pins", "example_record_pins"}:
                continue
            rows = origin.execute("SELECT * FROM " + table).fetchall()
            for row in rows:
                if table == "jobs" and row["status"] != "succeeded":
                    raise ValueError("A native public receipt contains a failed or unfinished job.")
                keys = row.keys()
                destination.execute(
                    "INSERT INTO "
                    + table
                    + "("
                    + ",".join(keys)
                    + ") VALUES("
                    + ",".join("?" for _ in keys)
                    + ")",
                    tuple(row),
                )
    for name in ("assets", "jobs", "public"):
        if (source / name).is_dir():
            shutil.copytree(source / name, state / name, dirs_exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--receipts",
        nargs=3,
        type=Path,
        required=True,
        help="DrugCLIP, GNINA and DELi acceptance directories with state + acceptance.json",
    )
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    args = parser.parse_args()
    if (args.state / "jobs.sqlite3").exists():
        raise ValueError(
            "Use a fresh isolated case-export directory; existing research is not overwritten."
        )
    settings = Settings(
        state_dir=args.state,
        image_file=args.state / "unused/image",
        code_file=args.state / "unused/code",
        model_dir=args.state / "models",
        cache_dir=args.state / "cache",
        minimum_free_bytes=0,
    )
    create_app(settings)  # Schema registration only; never start the lifespan or a Worker.
    store = Store(args.state / "jobs.sqlite3")
    available = {}
    for receipt in args.receipts:
        entries = json.loads((receipt / "acceptance.json").read_text())
        merge(receipt / "state", args.state, store)
        for entry in entries:
            if entry["job"]["status"] != "succeeded" or not entry["result"]["complete"]:
                raise ValueError(
                    "Every retained example must be an actual successful native result."
                )
            if entry["job"]["request"].get("payload", {}).get("model_action") != "predict":
                available[entry["job"]["request"]["operation"]] = entry["job"]["id"]
    assets = AssetStore(store, args.state / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings)
    pins = ExamplePins(store, args.state)
    for capability, operation in OPERATIONS.items():
        if operation not in available:
            raise ValueError("Missing actual public native evidence for " + capability)
        prepared = prepare_example(
            capability, scientific, args.state / "public-example-cache", records=records
        )
        pins.pin(capability, available[operation], prepared)
    from opendde_workbench.examples.library import ExampleLibrary

    ExampleLibrary(store).synchronize()
    receipt = export_bundle(
        settings, args.output, args.source_revision, capabilities=tuple(OPERATIONS)
    )
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
