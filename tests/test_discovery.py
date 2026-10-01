"""Behavioral boundaries, actual source snapshots, SQLite and HTTP/CSRF tests."""

import copy
import hashlib
import json

import pytest
from pydantic import ValidationError

from opendde_workbench.discovery.contract import TargetResearchTask
from opendde_workbench.discovery.result import validate_result
from opendde_workbench.discovery.runner import freeze_sources, run
from opendde_workbench.discovery.sequence import validate_sequence_source
from opendde_workbench.discovery.transport import SourceUnavailable, fetch
from opendde_workbench.requests import TASK_ADAPTER


def task(**kwargs):
    return TargetResearchTask(
        entity="target", identifier="ENSG00000133703", allow_external=True, **kwargs
    )


def receipt(document):
    raw = json.dumps(document).encode()
    return {
        "url": "https://api.platform.opentargets.org/api/v4/graphql",
        "response_sha256": hashlib.sha256(raw).hexdigest(),
        "release": "",
        "raw_document": raw,
    }


def test_request_requires_exact_identity_consent_and_no_molecular_constraints():
    value = task()
    assert TASK_ADAPTER.validate_python(value.model_dump()).operation == "target_research"
    for patch in (
        {"identifier": "KRAS"},
        {"allow_external": False},
        {"limit": 501},
        {"entity": "disease"},
        {"arbitrary_url": "http://localhost"},
    ):
        with pytest.raises(ValidationError):
            TargetResearchTask.model_validate({**value.model_dump(), **patch})


@pytest.mark.parametrize(
    "url",
    [
        "http://api.platform.opentargets.org/api/v4/graphql",
        "https://127.0.0.1/",
        "https://api.platform.opentargets.org.evil.test/",
        "https://user:secret@rest.uniprot.org/",
        "https://rest.uniprot.org:8443/",
    ],
)
def test_unreviewed_urls_fail_before_network(url):
    with pytest.raises(ValueError, match="reviewed"):
        fetch(url)


def test_primary_snapshot_and_sequence_tamper_rejected(tmp_path, monkeypatch):
    from opendde_workbench.discovery import runner

    selected = task()
    entity = {
        "id": selected.identifier,
        "approvedSymbol": "KRAS",
        "proteinIds": [{"id": "P01116", "source": "uniprot_swissprot"}],
        "associatedDiseases": {"count": 0, "rows": []},
    }
    protein = {
        "primaryAccession": "P01116",
        "organism": {"taxonId": 9606},
        "sequence": {"value": "MTEYK"},
        "uniProtKBCrossReferences": [],
    }
    monkeypatch.setattr(
        runner, "evidence", lambda *args: (entity, receipt({"data": {"target": entity}}))
    )
    monkeypatch.setattr(runner, "protein", lambda *args: (protein, receipt(protein)))
    monkeypatch.setattr(
        runner, "activities", lambda *args: ({"status": "empty", "rows": [], "total": 0}, [])
    )
    result = run(selected, tmp_path)
    freeze_sources(result, tmp_path)
    assert validate_result(result, selected, tmp_path).materials[0]["sequence"] == "MTEYK"
    changed = copy.deepcopy(result)
    changed["entity"]["approvedSymbol"] = "OTHER"
    with pytest.raises(ValueError, match="source snapshot"):
        validate_result(changed, selected, tmp_path)
    (tmp_path / "P01116.fasta").write_text(">P01116\nAAAAA\n")
    with pytest.raises(ValueError, match="changed"):
        validate_result(result, selected, tmp_path)


def test_optional_source_failure_is_visible_not_fabricated(tmp_path, monkeypatch):
    from opendde_workbench.discovery import runner

    selected = task()
    entity = {
        "id": selected.identifier,
        "proteinIds": [{"id": "P01116", "source": "uniprot_swissprot"}],
        "associatedDiseases": {"count": 0, "rows": []},
    }
    monkeypatch.setattr(
        runner, "evidence", lambda *args: (entity, receipt({"data": {"target": entity}}))
    )

    def unavailable(*args):
        raise SourceUnavailable("Source temporarily unavailable.")

    monkeypatch.setattr(runner, "protein", unavailable)
    monkeypatch.setattr(runner, "activities", unavailable)
    result = run(selected, tmp_path)
    freeze_sources(result, tmp_path)
    assert [x["status"] for x in result["sources"]] == ["ok", "unavailable", "unavailable"]
    assert not result["materials"] and result["activities"] is None
    validate_result(result, selected, tmp_path)


def test_lookup_requires_csrf_consent_and_preserves_empty(client_factory, monkeypatch):
    from opendde_workbench.discovery import routes

    monkeypatch.setattr(
        routes, "lookup", lambda *args: {"hits": [], "total": 0, "source": "Open Targets"}
    )
    with client_factory() as client:
        payload = {"query": "KRAS", "entity": "target", "allow_external": True}
        token = client.headers.pop("X-Workbench-CSRF")
        assert client.post("/api/discovery/lookup", json=payload).status_code == 403
        client.headers["X-Workbench-CSRF"] = token
        assert (
            client.post(
                "/api/discovery/lookup", json={**payload, "allow_external": False}
            ).status_code
            == 422
        )
        assert client.post("/api/discovery/lookup", json=payload).json()["hits"] == []
        assert client.get("/api/jobs").json() == []


def test_exact_sequence_provenance_rejects_modified_and_multiple_records(tmp_path):
    file = tmp_path / "source.fasta"
    file.write_text(">source\nMTEYK\n")
    validate_sequence_source(file, "MTEYK")
    with pytest.raises(ValueError, match="differs"):
        validate_sequence_source(file, "MTEYA")
    file.write_text(">one\nMTEYK\n>two\nMTEYK\n")
    with pytest.raises(ValueError, match="one exact"):
        validate_sequence_source(file, "MTEYK")
