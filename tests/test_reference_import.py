"""Archive identifiers, record identity, exact receipts and API boundary regression."""

import copy
import hashlib

import pytest
from pydantic import ValidationError

from opendde_workbench.discovery.archive import validate_archive
from opendde_workbench.discovery.import_contract import ReferenceImportTask
from opendde_workbench.discovery.import_runner import run_import, validate_import_result
from opendde_workbench.discovery.transport import SourceUnavailable
from opendde_workbench.requests import TASK_ADAPTER


def task(**changes):
    return ReferenceImportTask.model_validate(
        {"source": "pdb", "identifier": "1CRN", "format": "cif", "allow_external": True, **changes}
    )


def test_import_discriminator_and_source_contract():
    assert TASK_ADAPTER.validate_python(task().model_dump()).operation == "reference_import"
    assert task(identifier=" 1crn ").identifier == "1CRN"
    for changes in (
        {"identifier": "../1CRN"},
        {"identifier": "https://evil.test"},
        {"allow_external": False},
        {"format": "sdf"},
        {"source": "chembl"},
        {"identifier": "PDB_00001CRN", "format": "pdb"},
        {"activity_id": 1},
    ):
        with pytest.raises(ValidationError):
            task(**changes)


def test_archive_identity_and_frames_fail_closed():
    raw = b"data_1CRN\n_entry.id 1CRN\n_atom_site.Cartn_x\n"
    validate_archive(raw, task())
    for value in (
        b"",
        b"<html>not a structure</html>",
        raw.replace(b"_entry.id 1CRN", b"_entry.id 2CRN"),
        raw + b"\x00",
    ):
        with pytest.raises(SourceUnavailable):
            validate_archive(value, task())


def test_archive_preserves_original_bytes_and_checks_every_receipt(tmp_path, monkeypatch):
    from opendde_workbench.discovery import import_runner

    raw = b"data_1CRN\n_entry.id 1CRN\n_atom_site.Cartn_x\n"

    def response(url, *args, **kwargs):
        return raw, {
            "url": url,
            "response_sha256": hashlib.sha256(raw).hexdigest(),
            "release": "",
            "raw_document": raw,
        }

    monkeypatch.setattr(import_runner, "request_bytes", response)
    selected = task()
    result = run_import(selected, tmp_path)
    assert (tmp_path / result["artifact"]).read_bytes() == raw
    assert validate_import_result(result, selected, tmp_path) == result
    for key, value in (
        ("kind", "molecule"),
        ("identifier", "2CRN"),
        ("preparation", "ready_for_docking"),
        ("activity_id", 42),
    ):
        changed = copy.deepcopy(result)
        changed[key] = value
        with pytest.raises(ValueError):
            validate_import_result(changed, selected, tmp_path)
    changed = copy.deepcopy(result)
    changed["receipts"][0]["url"] = "https://files.rcsb.org/download/2CRN.cif"
    with pytest.raises(ValueError, match="identity"):
        validate_import_result(changed, selected, tmp_path)
    (tmp_path / "source-01.snapshot").write_bytes(b"changed")
    with pytest.raises(ValueError, match="snapshot changed"):
        validate_import_result(result, selected, tmp_path)


def test_import_api_csrf_validation_and_no_unselected_provenance(client_factory):
    with client_factory() as client:
        data = task().model_dump(mode="json")
        token = client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/jobs", json=data).status_code == 403
        client.headers["X-Workbench-CSRF"] = token
        assert (
            client.post("/api/jobs", json={**data, "identifier": "../../etc/passwd"}).status_code
            == 422
        )
        assert client.get("/api/jobs").json() == []


def test_chembl_single_detail_protocol_preserves_eof_record_and_exact_id():
    selected = task(source="chembl", identifier="CHEMBL25", format="sdf")
    # Protocol framing fixture, not a molecule used to claim native scientific validation.
    raw = b"header\nM  END\n> <chembl_id>\nCHEMBL25\n\n"
    validate_archive(raw, selected)
    validate_archive(raw + b"$$$$\n", selected)
    for changed in (
        raw.replace(b"CHEMBL25", b"CHEMBL26"),
        raw + raw,
        raw + b"$$$$\nextra",
        raw.replace(b"M  END", b"missing"),
    ):
        with pytest.raises(SourceUnavailable):
            validate_archive(changed, selected)
