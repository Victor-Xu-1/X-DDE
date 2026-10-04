from uuid import uuid4

import pytest
from conftest import ProcessEngine, payload, wait_status
from test_jobs import submit

from opendde_workbench.models import Component, Prediction


def test_csrf_origin_and_host_boundaries(client_factory):
    with client_factory() as client:
        assert (
            client.post(
                "/api/jobs",
                json=payload(),
                headers={"Idempotency-Key": str(uuid4()), "X-Workbench-CSRF": "bad"},
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/jobs",
                json=payload(),
                headers={"Idempotency-Key": str(uuid4()), "Origin": "https://untrusted.example"},
            ).status_code
            == 403
        )
        assert client.get("/api/jobs", headers={"Host": "untrusted.example"}).status_code == 400
        assert client.get("/api/session").headers["cache-control"] == "no-store"
        assert (
            "frame-ancestors 'none'" in client.get("/api/jobs").headers["content-security-policy"]
        )
        viewer = client.get("/viewer.html")
        assert viewer.status_code == 200
        assert "frame-ancestors 'self'" in viewer.headers["content-security-policy"]
        assert "frame-ancestors 'none'" in client.get("/").headers["content-security-policy"]


def test_validation_and_capacity(client_factory):
    with client_factory(ProcessEngine(ready=False)) as client:
        assert submit(client).status_code == 503
    with client_factory() as client:
        bad = payload()
        bad["components"][0]["value"] = "FILE_/etc/passwd"
        response = submit(client, bad)
        assert response.status_code == 422
        assert "input" not in response.json()["detail"][0]
        assert (
            client.post(
                "/api/jobs", content="x" * 262145, headers={"Content-Type": "application/json"}
            ).status_code
            == 413
        )
        assert client.get("/api/jobs/not-a-uuid").status_code == 422
        assert client.get(f"/api/jobs/{uuid4()}").status_code == 404
        assert client.get("/api/jobs?limit=1001").status_code == 422


@pytest.mark.parametrize(
    "name",
    ["../outside.txt", "/etc/passwd", "../../jobs.sqlite3", "..\\outside.txt", "linked.json"],
)
def test_download_path_and_symlink_containment(client_factory, settings, name):
    with client_factory() as client:
        job_id = submit(client).json()["id"]
        wait_status(client, job_id, {"succeeded"})
        outside = settings.state_dir / "outside.txt"
        outside.write_text("not downloadable")
        (settings.state_dir / "jobs" / job_id / "output/linked.json").symlink_to(outside)
        assert client.get(f"/api/jobs/{job_id}/download", params={"name": name}).status_code == 404
        assert all(
            item["name"] != "linked.json"
            for item in client.get(f"/api/jobs/{job_id}/artifacts").json()
        )


def test_input_builder_normalizes_sequences_without_interpreting_task_names():
    value = Prediction(
        name="../display name; $(echo bad)",
        components=[
            Component(kind="protein", value=" acd\nEF "),
            Component(kind="ligand", value="C/C=C\\C"),
        ],
    )
    document = value.inference_input("safe-id")[0]
    assert document["name"] == "safe-id"
    assert document["sequences"][0]["proteinChain"]["sequence"] == "ACDEF"
    assert document["sequences"][1]["ligand"]["ligand"] == "C/C=C\\C"


def test_single_fasta_is_normalized_but_multiple_records_are_rejected():
    assert Component(kind="protein", value=">target\nACD EF\nG").value == "ACDEFG"
    with pytest.raises(ValueError):
        Component(kind="protein", value=">first\nACD\n>second\nEFG")


def test_missing_optional_model_is_rejected_before_queueing(client_factory):
    with client_factory() as client:
        request = payload()
        request["parameters"] = {"model": "abag"}
        response = submit(client, request)
        assert response.status_code == 503
        assert "ABAG checkpoint" in response.json()["detail"]
        assert client.get("/api/jobs").json() == []

@pytest.mark.parametrize("path", ["/", "/index.html", "/viewer.html?v=next-release", "/molecular.html", "/theme-init.js"])
def test_ui_bootstrap_is_not_stored_across_releases(client_factory, path):
    with client_factory() as client:
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
