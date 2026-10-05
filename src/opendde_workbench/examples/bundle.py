"""Portable fixed results restore into the existing asset/task authorities without execution."""

import json
from pathlib import Path

from ..assets import AssetStore
from ..store import Store
from .bundle_archive import safe_path, sha256, write_archive
from .bundle_projection import project_records, references
from .bundle_restore import restore_bundle as restore_bundle
from .bundle_sources import archive_sources
from .catalogue import CASES, FILES, MODULES
from .evidence import capture_job
from .files import verified_file
from .pins import ExamplePins
from .preparation import prepare_example
from .records import ExampleRecords


def catalogue_digest():
    return sha256(Path(__file__).with_name("catalogue.json"))


def verify_examples(settings, capabilities=None):
    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    pins, records = ExamplePins(store, settings.state_dir), ExampleRecords(store, assets, settings)
    computed = validated = 0
    selected = tuple(MODULES) if capabilities is None else tuple(capabilities)
    for capability in selected:
        pin = pins.get(capability, verify=True)
        record = records.get(capability, verify=True)
        if pin or record and record.computed_result_available:
            computed += 1
        elif record:
            validated += 1
        else:
            raise ValueError("The bundle lacks a fixed example for " + capability)
    return {"modules": len(selected), "computed": computed, "validated": validated}


def export_bundle(settings, target, source_revision):
    from ..research.storage import ScientificStore

    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings)
    summary = verify_examples(settings)
    roots = set()
    for capability in MODULES:
        prepared = prepare_example(
            capability, scientific, settings.state_dir / "public-example-cache", records=records
        )
        roots.update(references(prepared.model_dump(mode="json")))
    rows = project_records(store, roots)
    paths = {}
    for row in rows["assets"]:
        asset = assets.get(row["id"])
        path = assets.path(asset)
        if sha256(path) != asset.sha256:
            raise ValueError("A case asset changed before export.")
        paths[f"assets/{asset.id}/content{asset.suffix}"] = path
    for row in rows["jobs"]:
        evidence = capture_job(store, settings.state_dir, row["id"])
        for name in evidence.artifact_sha256:
            relative = f"jobs/{row['id']}/output/{name}"
            paths[relative] = safe_path(settings.state_dir, relative)
        output = settings.state_dir / "jobs" / row["id"] / "output"
        for name, path in archive_sources(store.get(row["id"]), output).items():
            paths[f"jobs/{row['id']}/output/{name}"] = path
    for row in rows["jobs"]:
        analysis = settings.state_dir / "jobs" / row["id"] / "analysis" / "workbench-analysis.json"
        if analysis.is_file() and json.loads(analysis.read_text()).get("schema_version") == 4:
            paths[f"jobs/{row['id']}/analysis/workbench-analysis.json"] = analysis
            for path in (analysis.parent / "workbench-aligned").glob("*.cif"):
                paths[f"jobs/{row['id']}/analysis/workbench-aligned/{path.name}"] = path
    for spec in FILES.values():
        verified_file(settings.state_dir / "public-example-cache", spec)
        paths["public-example-cache/" + spec.sha256] = (
            settings.state_dir / "public-example-cache" / spec.sha256
        )
    manifest = {
        "schema_version": 1,
        "catalogue_sha256": catalogue_digest(),
        "source_revision": source_revision,
        "summary": summary,
        "records": rows,
        "notices": {
            "sources": sorted({url for case in CASES.values() for url in case.sources}),
            "licenses": [
                "RCSB PDB: CC0-1.0",
                "ChEMBL: CC-BY-SA-3.0",
                "UniProt/Swiss-Prot: CC-BY-4.0",
            ],
            "methods": (
                "Retained native computational predictions; not experimental affinity. "
                "MZ1 regions are geometric annotations. "
                "Campaign is native configuration validation only."
            ),
        },
    }
    return {
        **summary,
        **write_archive(target, manifest, paths),
        "jobs": len(rows["jobs"]),
        "assets": len(rows["assets"]),
    }
