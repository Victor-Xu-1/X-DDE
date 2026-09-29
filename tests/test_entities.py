import pytest
from conftest import wait_status
from test_jobs import submit

from opendde_workbench.models import Component, Prediction


@pytest.mark.parametrize(
    "kind,value,expected,key",
    [
        ("dna", ">strand\ngat c", "GATC", "dnaSequence"),
        ("rna", "gua c", "GUAC", "rnaSequence"),
        ("ion", "mg", "MG", "ion"),
    ],
)
def test_native_entity_contract(kind, value, expected, key):
    request = Prediction(name="nucleic", components=[Component(kind=kind, value=value, count=2)])
    native = request.inference_input("safe-id")[0]["sequences"][0][key]
    assert native["ion" if kind == "ion" else "sequence"] == expected
    assert native["count"] == 2


@pytest.mark.parametrize(
    "kind,value",
    [
        ("dna", "AUGC"),
        ("rna", "ATGC"),
        ("dna", ">first\nATGC\n>second\nGATC"),
        ("ion", "FILE_/etc/passwd"),
        ("ion", "INVALID"),
    ],
)
def test_reject_invalid_entities_before_execution(client_factory, kind, value):
    with client_factory() as client:
        response = submit(
            client, {"name": "invalid", "components": [{"kind": kind, "value": value}]}
        )
        assert response.status_code == 422
        assert client.get("/api/jobs").json() == []


def test_multi_entity_queue_persists_native_input_and_reloads(client_factory):
    request = {
        "name": "multi entity",
        "components": [
            {"kind": "dna", "value": "GATC"},
            {"kind": "rna", "value": "GUAC"},
            {"kind": "ion", "value": "MG"},
        ],
    }
    with client_factory() as client:
        result = submit(client, request)
        assert result.status_code == 201
        job_id = result.json()["id"]
        wait_status(client, job_id, {"succeeded"})
        native = client.get(f"/api/jobs/{job_id}/input").json()[0]
        assert [next(iter(x)) for x in native["sequences"]] == ["dnaSequence", "rnaSequence", "ion"]
    with client_factory() as client:
        assert client.get(f"/api/jobs/{job_id}").json()["request"]["components"][2]["value"] == "MG"
