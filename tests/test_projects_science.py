"""Project persistence and scientific endpoint boundaries use the actual API/database."""

from uuid import uuid4

from conftest import wait_status
from test_jobs import submit


def test_project_creation_linkage_and_restart(client_factory):
    with client_factory() as client:
        assert client.get("/api/projects").json() == []
        invalid = client.post("/api/projects", json={"name": ""})
        assert invalid.status_code == 422
        created = client.post(
            "/api/projects", json={"name": "KRAS workspace", "description": "Co-folding"}
        )
        assert created.status_code == 201
        project = created.json()
        assert project["name"] == "KRAS workspace"
        request = {
            "name": "linked",
            "components": [{"kind": "ligand", "value": "CCO"}],
            "project_id": project["id"],
        }
        job_id = submit(client, request).json()["id"]
        assert wait_status(client, job_id, {"succeeded"})["request"]["project_id"] == project["id"]
        missing = {**request, "project_id": str(uuid4())}
        assert submit(client, missing).status_code == 422
    with client_factory() as client:
        assert [item["id"] for item in client.get("/api/projects").json()] == [project["id"]]
        assert client.get(f"/api/jobs/{job_id}").json()["request"]["project_id"] == project["id"]


def test_science_endpoints_require_real_runtime_and_completed_task(client_factory):
    with client_factory() as client:
        job_id = submit(client).json()["id"]
        assert client.get(f"/api/jobs/{job_id}/analysis").status_code in {409, 503}
        wait_status(client, job_id, {"succeeded"})
        for suffix in ("analysis", "candidates.csv", "report"):
            response = client.get(f"/api/jobs/{job_id}/{suffix}")
            assert response.status_code == 503
            assert "Docker runtime" in response.json()["detail"]
        assert client.get(f"/api/jobs/{uuid4()}/analysis").status_code == 404
