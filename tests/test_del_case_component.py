"""Install the immutable full DEL cohort through existing case-data authorities."""

import json
import os
import sqlite3
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest

from opendde_workbench.deployment.catalog import CASE_BUNDLE_IDS, PACKAGES, dependencies
from opendde_workbench.examples import del_bundle_release as source
from opendde_workbench.examples.bundle import restore_bundle, verify_examples


def test_del_data_component_is_data_only_and_uses_the_single_existing_queue():
    package = PACKAGES["public-del-examples"]
    assert package.id in CASE_BUNDLE_IDS
    assert package.kind == "data" and package.engine == "x-dde" and package.automatic
    assert package.url == source.URL and package.checksum == source.SHA256
    assert package.version == source.VERSION == "2"
    assert dependencies(package.id) == [package.id]


def test_published_full_del_data_cold_restore_preserves_records_without_execution(settings):
    from opendde_workbench.api import create_app
    from opendde_workbench.store import Store

    filename = os.environ.get("WB_REVIEWED_DEL_DATA2")
    if not filename:
        pytest.skip("The exact full-cohort archive is supplied by the scoped delivery gate")
    archive = Path(filename)
    assert archive.stat().st_size == source.BYTES
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
    assert manifest["profile"] == "del6"
    assert manifest["source_revision"] == source.SOURCE_REVISION
    assert manifest["capabilities"] == list(source.CAPABILITIES)
    create_app(settings)
    store = Store(settings.state_dir / "jobs.sqlite3")
    private = str(uuid4())
    with store.connect() as db:
        db.execute(
            "INSERT INTO projects VALUES(?,?,?,?)",
            (private, "Personal research", "Retain", "today"),
        )
    restore_bundle(archive, settings, source.SHA256)
    assert verify_examples(settings, source.CAPABILITIES, profile="del6") == {
        "modules": 5,
        "computed": 5,
        "validated": 0,
    }
    with store.connect() as db:
        before = {
            table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
            for table in ("jobs", "assets", "example_pins")
        }
        assert before == {"jobs": 6, "assets": 3, "example_pins": 5}
        assert not db.execute(
            "SELECT id FROM jobs WHERE status IN ('queued','running','cancelling')"
        ).fetchall()
        assert (
            db.execute("SELECT description FROM projects WHERE id=?", (private,)).fetchone()[0]
            == "Retain"
        )
    restore_bundle(archive, settings, source.SHA256)
    with store.connect() as db:
        assert before == {
            table: db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0] for table in before
        }
    native = settings.state_dir / "jobs/891e0487-837a-4b8c-ad95-381b22f896e8/output/analysis.sqlite"
    with sqlite3.connect("file:" + str(native) + "?mode=ro", uri=True) as db:
        assert db.execute("SELECT COUNT(*) FROM members").fetchone()[0] == 518285
        assert db.execute("SELECT COUNT(*) FROM enrichment").fetchone()[0] == 1036570
        assert db.execute(
            "SELECT supporting_samples,prioritizable FROM enrichment "
            "WHERE member=? AND comparison=?",
            ("A047-B058-C036", "BRD4_E2_vs_matrix"),
        ).fetchone() == (1, 0)
