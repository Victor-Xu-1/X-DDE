"""Same-name native sources expose recorded dates without changing result identities."""

import hashlib

from test_dataset_member_inspection import prepared_index


def test_summary_and_source_picker_keep_the_exact_recorded_creation_time(settings, client_factory):
    store, earlier, first_file = prepared_index(settings)
    _, later, second_file = prepared_index(settings)
    times = {earlier: "2026-10-17T13:44:46+00:00", later: "2026-10-17T14:46:43+00:00"}
    with store.connect() as db:
        for identifier, value in times.items():
            db.execute("UPDATE jobs SET created_at=? WHERE id=?", (value, identifier))
    originals = {path: path.read_bytes() for path in (first_file, second_file)}
    with client_factory() as client:
        response = client.get("/api/datasets/results?role=index")
        assert response.status_code == 200, response.text
        items = response.json()
        assert [item["job_id"] for item in items] == [later, earlier]
        assert len({item["name"] for item in items}) == 1
        for item in items:
            assert item["created_at"] == times[item["job_id"]]
            summary = client.get(f"/api/datasets/{item['job_id']}/summary")
            assert summary.status_code == 200, summary.text
            assert summary.json()["created_at"] == item["created_at"]
            result = settings.state_dir / "jobs" / item["job_id"] / "output/result.json"
            assert item["report_sha256"] == hashlib.sha256(result.read_bytes()).hexdigest()
            assert summary.json()["report_sha256"] == item["report_sha256"]
    assert all(path.read_bytes() == raw for path, raw in originals.items())
    assert len(store.list_jobs()) == 2
