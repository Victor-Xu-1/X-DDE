"""Actual public supplier bytes and native preparation, only on isolated CI/servers."""

import json
import os
import re
import sqlite3
from pathlib import Path

import pytest
from dataset_native_fixture import Native

from opendde_workbench.dataset_inputs import inspect_data
from opendde_workbench.datasets.public_resources import RESOURCES
from opendde_workbench.deployment.supplier_files import extract_structure, prepare_structure
from opendde_workbench.deployment.transfers import download

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_TEST_SUPPLIER_NATIVE") != "1",
    reason="Public supplier chemistry runs in scoped CI or the target server",
)


@pytest.mark.parametrize("resource", RESOURCES.values(), ids=RESOURCES.keys())
def test_actual_supplier_sdf_preserves_original_identifiers_and_prepares_native_library(
    resource, tmp_path, monkeypatch
):
    native = Native(tmp_path, monkeypatch)
    archive = tmp_path / "public-source.zip"
    download(resource["url"], archive, resource["archive_sha256"], lambda _: None, lambda: None)
    blocks, count, size = [], 0, 0
    source = tmp_path / resource.get("source_filename", resource["filename"])
    extract_structure(archive, resource, source, lambda: None)
    prepared = prepare_structure(source, resource, tmp_path, lambda: None)
    assert inspect_data(prepared, ".sdf") == resource["sha256"]
    with prepared.open("rb") as stream:
        for line in stream:
            size += len(line)
            assert size <= 12 * 1024**2, "Representative source records exceed their budget."
            blocks.append(line)
            if line.strip() == b"$$$$":
                count += 1
                if count == 3:
                    break
    assert count == 3
    content = b"".join(blocks)
    expected_ids = re.findall(
        r"(?m)^>\s*(?:\d+\s*)?<" + re.escape(resource["id_column"]) + r">[^\r\n]*\r?\n([^\r\n]+)",
        content.decode("utf-8-sig"),
    )
    assert len(expected_ids) == 3
    material = native.material(content, ".sdf", "data")
    task = native.task(
        "library_prepare",
        {
            "kind": "chemistry",
            "supplier": resource["supplier"],
            "library_name": resource["label"][1],
            "id_column": resource["id_column"],
            "source_permission": "official_public_resource",
            "source_url": resource["source_page"],
        },
        [material],
    )
    native.module("native_library").run(task.model_dump(mode="json"))
    result = native.check(task)
    assert result.counts["source_records"] == result.counts["valid_records"] == 3
    assert result.counts["rejected_records"] == 0
    with sqlite3.connect(native.root / "output/library.sqlite") as db:
        identifiers = list(db.execute("SELECT supplier_id FROM records ORDER BY record"))
        assert [row[0] for row in identifiers] == [value.strip() for value in expected_ids]
        assert all(row[0].strip() for row in identifiers)
        assert db.execute("SELECT min(heavy_atoms) FROM compounds").fetchone()[0] > 1
    assert result.metadata["supplier"] == resource["supplier"]
    assert result.metadata["source_url"] == resource["source_page"]
    evidence = Path(__file__).parent / "evidence/supplier-files"
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / (resource["id"] + ".json")).write_text(
        json.dumps(
            {
                "resource": resource["id"],
                "archive_sha256": resource["archive_sha256"],
                "id_column": resource["id_column"],
                "representative_records": 3,
                "native_counts": result.counts,
                "all_sample_supplier_ids_retained": True,
                "full_corpus_chemical_validation": False,
                "full_corpus_text_verified": True,
                "source_sha256": resource.get("source_sha256", resource["sha256"]),
                "text_profile": resource.get("text_profile"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
