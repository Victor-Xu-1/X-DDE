"""Portable original-response identity; protocol fixtures, no scientific execution."""

import copy
import hashlib
import json
from types import SimpleNamespace

import pytest

from opendde_workbench.discovery.import_contract import ReferenceImportTask
from opendde_workbench.examples.bundle_sources import archive_sources


def material(tmp_path, *, source="pdb"):
    task = ReferenceImportTask.model_validate(
        {
            "source": source,
            "identifier": "1CRN" if source == "pdb" else "CHEMBL25",
            "format": "cif" if source == "pdb" else "sdf",
            "allow_external": True,
        }
    )
    raw = (
        b"data_1CRN\n_entry.id 1CRN\n_atom_site.Cartn_x\n"
        if source == "pdb"
        else b"header\nM  END\n> <chembl_id>\nCHEMBL25\n\n"
    )
    digest = hashlib.sha256(raw).hexdigest()
    urls = (
        ["https://files.rcsb.org/download/1CRN.cif"]
        if source == "pdb"
        else [
            "https://www.ebi.ac.uk/chembl/api/data/molecule/CHEMBL25" + e for e in (".json", ".sdf")
        ]
    )
    value = {
        "operation": "reference_import",
        "complete": True,
        "schema_version": 1,
        "request": task.model_dump(mode="json"),
        "retrieved_at": "2026-10-04T00:00:00+00:00",
        "source": source,
        "identifier": task.identifier,
        "artifact": task.identifier + "." + task.format,
        "kind": "structure" if source == "pdb" else "molecule",
        "sha256": digest,
        "evidence": None,
        "activity_id": None,
        "preparation": "original_archive_bytes_not_prepared_or_bound_pose",
        "receipts": [
            {"url": url, "artifact": f"source-{i:02d}.snapshot", "response_sha256": digest}
            for i, url in enumerate(urls, 1)
        ],
    }
    (tmp_path / value["artifact"]).write_bytes(raw)
    (tmp_path / "result.json").write_text(json.dumps(value))
    return SimpleNamespace(request=task), value, raw


def test_legacy_raw_response_is_recovered_only_as_identical_bytes(tmp_path):
    job, value, raw = material(tmp_path)
    with pytest.raises(FileNotFoundError):
        archive_sources(job, tmp_path)
    original = (tmp_path / "result.json").read_bytes()
    paths = archive_sources(job, tmp_path, recover=True)
    assert paths["source-01.snapshot"].read_bytes() == raw
    assert hashlib.sha256(paths["source-01.snapshot"].read_bytes()).hexdigest() == value["sha256"]
    assert (tmp_path / "result.json").read_bytes() == original
    assert archive_sources(job, tmp_path) == paths


@pytest.mark.parametrize("mutation", ["digest", "url", "path", "request"])
def test_changed_evidence_cannot_create_a_replacement_receipt(tmp_path, mutation):
    job, value, _ = material(tmp_path)
    changed = copy.deepcopy(value)
    if mutation == "digest":
        changed["receipts"][0]["response_sha256"] = "0" * 64
    elif mutation == "url":
        changed["receipts"][0]["url"] = "https://files.rcsb.org/download/2CRN.cif"
    elif mutation == "path":
        changed["receipts"][0]["artifact"] = "../outside.snapshot"
    else:
        changed["request"]["identifier"] = "2CRN"
    (tmp_path / "result.json").write_text(json.dumps(changed))
    with pytest.raises(ValueError):
        archive_sources(job, tmp_path, recover=True)
    assert not (tmp_path / "source-01.snapshot").exists()


def test_existing_changed_receipt_is_preserved_and_rejected(tmp_path):
    job, _, _ = material(tmp_path)
    path = tmp_path / "source-01.snapshot"
    path.write_bytes(b"Changed original evidence")
    with pytest.raises(ValueError, match="snapshot changed"):
        archive_sources(job, tmp_path, recover=True)
    assert path.read_bytes() == b"Changed original evidence"


def test_unavailable_chembl_metadata_is_never_inferred_from_molecular_bytes(tmp_path):
    job, _, _ = material(tmp_path, source="chembl")
    with pytest.raises(FileNotFoundError):
        archive_sources(job, tmp_path, recover=True)
    assert not (tmp_path / "source-01.snapshot").exists()
    assert not (tmp_path / "source-02.snapshot").exists()
