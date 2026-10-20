"""Separate selected module results from their verified native source dependencies."""

from .bundle_pin_dependencies import source_pins

PIN_FIELDS = ("capability_id", "revision", "job_id")


def dependency_inventory(rows, capabilities):
    return sorted(
        (
            {key: row[key] for key in PIN_FIELDS}
            for row in rows.get("example_pins", [])
            if row["capability_id"] not in capabilities
        ),
        key=lambda row: tuple(row[key] for key in PIN_FIELDS),
    )


def validate_inventory(manifest, rows, catalogue, capabilities):
    expected = dependency_inventory(rows, capabilities)
    declared = manifest.get("source_pin_dependencies", [])
    if not isinstance(declared, list) or len(declared) > 128 or declared != expected:
        raise ValueError("Native source pin dependencies differ from their declared inventory.")
    eligible = {
        index
        for indexes in source_pins(
            rows.get("example_pins", []), catalogue.modules, set(capabilities)
        ).values()
        for index in indexes
    }
    if any(
        index not in eligible
        for index, row in enumerate(rows.get("example_pins", []))
        if row["capability_id"] not in capabilities
    ):
        raise ValueError("Native source pin dependencies are outside the reviewed study.")


def validate_closure(manifest, settings, catalogue, capabilities):
    expected = manifest.get("source_pin_dependencies", [])
    if not expected:
        return
    from ..assets import AssetStore
    from ..research.storage import ScientificStore
    from ..store import Store
    from .bundle_projection import project_records, references
    from .records import ExampleRecords

    store = Store(settings.state_dir / "jobs.sqlite3")
    assets = AssetStore(store, settings.state_dir / "assets")
    scientific = ScientificStore(store, assets)
    records = ExampleRecords(store, assets, settings, modules=catalogue.modules)
    roots = set()
    for capability in capabilities:
        prepared = catalogue.prepare(
            capability, scientific, settings.state_dir / "public-example-cache", records
        )
        roots.update(references(prepared.model_dump(mode="json")))
    projected = project_records(
        store, roots, capabilities=set(capabilities), modules=catalogue.modules
    )
    if dependency_inventory(projected, capabilities) != expected:
        raise ValueError("A native source pin is not consumed by the selected case lineage.")
