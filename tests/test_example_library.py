"""Examples remain accessible evidence without polluting personal task pagination."""

import json
from contextlib import contextmanager
from uuid import uuid4

import pytest

from opendde_workbench.examples.catalogue import MODULES
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.models import Status
from opendde_workbench.requests import Properties
from opendde_workbench.store import Store


def create(store, name="BRD4 personal analysis", project_id=None):
    return store.create(
        Properties(name=name, smiles=["c1ccccc1"], project_id=project_id), str(uuid4()), 50, 100
    )


def pin(store, job, table="example_pins", revision=None):
    body = {"job_id": job.id} if table == "example_pins" else {"evidence": [{"job_id": job.id}]}
    body["case_id"] = MODULES["properties"].case_id
    with store.connect() as db:
        db.execute(
            f"CREATE TABLE IF NOT EXISTS {table}(capability_id TEXT,revision INTEGER,body TEXT)"
        )
        db.execute(
            f"INSERT INTO {table} VALUES(?,?,?)",
            ("properties", revision or MODULES["properties"].revision, json.dumps(body)),
        )


def test_only_explicit_library_records_are_excluded_and_pagination_is_personal(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    first = create(store)
    library = ExampleLibrary(store)
    fixed = create(store, "Public BRD4 template")
    second = create(store, "Public BRD4 template")
    library.classify([fixed.id])
    assert [job.id for job in library.personal_jobs(1, 0)] == [second.id]
    assert [job.id for job in library.personal_jobs(1, 1)] == [first.id]
    assert store.get(fixed.id).request == fixed.request
    assert len(store.list_jobs()) == 3


def test_current_pins_are_classified_without_changing_job_lifecycle(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store)
    user = create(store)
    with store.connect() as db:
        db.execute("CREATE TABLE example_pins(capability_id TEXT,revision INTEGER,body TEXT)")
        db.execute(
            "INSERT INTO example_pins VALUES(?,?,?)",
            (
                "properties",
                MODULES["properties"].revision,
                json.dumps(
                    {
                        "job_id": fixed.id,
                        "case_id": MODULES["properties"].case_id,
                    }
                ),
            ),
        )
    library = ExampleLibrary(store)
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]
    assert store.get(fixed.id).status == fixed.status
    assert store.claim(fixed.id) is not None


@pytest.mark.parametrize("status", [Status.FAILED, Status.CANCELLED, Status.INTERRUPTED])
def test_fixed_example_terminal_retry_history_stays_in_library_without_mutation(tmp_path, status):
    store = Store(tmp_path / "jobs.sqlite3")
    previous = create(store, "A source import")
    store.claim(previous.id)
    store.finish(previous.id, status, "Retained retry provenance")
    before = store.get(previous.id).model_dump()
    fixed = store.create(previous.request, str(uuid4()), 50, 100, parent_id=previous.id)
    store.claim(fixed.id)
    store.finish(fixed.id, Status.SUCCEEDED)
    pin(store, fixed)
    personal = store.create(previous.request, str(uuid4()), 50, 100, parent_id=fixed.id)
    library = ExampleLibrary(store)
    assert [job.id for job in library.personal_jobs(20, 0)] == [personal.id]
    assert store.get(previous.id).model_dump() == before
    assert store.get(fixed.id).parent_id == previous.id
    assert len(store.list_jobs()) == 3


@pytest.mark.parametrize("different_request", [False, True])
def test_active_or_different_request_ancestor_is_not_classified_as_fixed(
    tmp_path, different_request
):
    store = Store(tmp_path / "jobs.sqlite3")
    previous = create(store, "Original personal request")
    store.claim(previous.id)
    if different_request:
        store.finish(previous.id, Status.FAILED)
    request = (
        previous.request.model_copy(update={"name": "Different request"})
        if different_request
        else previous.request
    )
    fixed = store.create(request, str(uuid4()), 50, 100, parent_id=previous.id)
    pin(store, fixed)
    assert [job.id for job in ExampleLibrary(store).personal_jobs(20, 0)] == [previous.id]


def test_new_tasks_using_template_inputs_are_not_automatically_examples(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store, project_id=uuid4())
    library = ExampleLibrary(store)
    library.classify([fixed.id])
    fresh = store.create(
        fixed.request.model_copy(update={"project_id": None}), str(uuid4()), 50, 100
    )
    assert [job.id for job in library.personal_jobs(20, 0)] == [fresh.id]


def test_reviewed_stat6_pins_join_the_library_without_hiding_new_template_submissions(tmp_path):
    from opendde_workbench.examples.stat6.catalogue import MODULES as STUDY_MODULES

    store = Store(tmp_path / "jobs.sqlite3")
    archive, fixed, personal = [create(store, "STAT6 template input") for _ in range(3)]
    pin(store, archive)
    module = STUDY_MODULES["properties"]
    with store.connect() as db:
        db.execute(
            "INSERT INTO example_pins VALUES(?,?,?)",
            (
                "properties",
                module.revision,
                json.dumps({"job_id": fixed.id, "case_id": module.case_id}),
            ),
        )
    library = ExampleLibrary(store)
    assert [job.id for job in library.personal_jobs(20, 0)] == [personal.id]
    assert store.get(fixed.id).request == fixed.request
    with store.connect() as db:
        db.execute(
            "UPDATE example_pins SET body=? WHERE revision=?",
            (
                json.dumps({"job_id": personal.id, "case_id": "different-study"}),
                module.revision,
            ),
        )
    with pytest.raises(ValueError, match="different reviewed study"):
        library.synchronize()


def test_invalid_classification_rolls_back_without_losing_history(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    user = create(store, project_id=uuid4())
    library = ExampleLibrary(store)
    with pytest.raises(ValueError, match="unknown example"):
        library.classify([user.id, str(uuid4())])
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]
    with store.connect() as db:
        assert not db.execute("SELECT 1 FROM example_library_projects").fetchone()


def test_user_jobs_in_a_shared_project_are_never_classified_by_project_name(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    project = uuid4()
    fixed = create(store, project_id=project)
    user = create(store, project_id=project)
    library = ExampleLibrary(store)
    library.classify([fixed.id], "setup_validation")
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]


@pytest.mark.parametrize("table", ["example_pins", "example_record_pins"])
def test_unchanged_pins_remain_read_only_and_preserve_classification(tmp_path, monkeypatch, table):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store, project_id=uuid4())
    personal = create(store)
    pin(store, fixed, table)
    library = ExampleLibrary(store)
    library.classify([fixed.id], "setup_validation")
    library.synchronize()
    with store.connect() as db:
        original = tuple(db.execute("SELECT * FROM example_library_tasks").fetchone())
    connect = store.connect
    statements = []

    @contextmanager
    def read_only():
        with connect() as db:
            db.execute("PRAGMA query_only=ON")
            db.set_trace_callback(statements.append)
            yield db

    monkeypatch.setattr(store, "connect", read_only)
    assert [job.id for job in library.personal_jobs(20, 0)] == [personal.id]
    with store.connect() as db:
        assert tuple(db.execute("SELECT * FROM example_library_tasks").fetchone()) == original
    assert not any(sql.lstrip().split()[0] in {"INSERT", "UPDATE", "DELETE"} for sql in statements)


def test_unchanged_pins_do_not_compete_with_an_unrelated_writer(tmp_path, monkeypatch):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store, project_id=uuid4())
    personal = create(store)
    pin(store, fixed)
    library = ExampleLibrary(store)
    library.synchronize()
    connect = store.connect

    @contextmanager
    def no_wait():
        with connect() as db:
            db.execute("PRAGMA busy_timeout=0")
            yield db

    monkeypatch.setattr(store, "connect", no_wait)
    with connect() as writer:
        writer.execute("BEGIN IMMEDIATE")
        writer.execute("INSERT INTO queue_control VALUES('unrelated', 'pending')")
        assert [job.id for job in library.personal_jobs(20, 0)] == [personal.id]


@pytest.mark.parametrize("table", ["example_pins", "example_record_pins"])
def test_synchronization_immediately_discovers_new_current_pins(tmp_path, table):
    store = Store(tmp_path / "jobs.sqlite3")
    first = create(store)
    fresh = create(store, project_id=uuid4())
    stale = create(store)
    pin(store, first, table)
    library = ExampleLibrary(store)
    library.synchronize()
    pin(store, fresh, table)
    pin(store, stale, table, MODULES["properties"].revision + 1)
    assert [job.id for job in library.personal_jobs(20, 0)] == [stale.id]
    with store.connect() as db:
        assert db.execute(
            "SELECT 1 FROM example_library_projects WHERE project_id=?",
            (str(fresh.request.project_id),),
        ).fetchone()


@pytest.mark.parametrize("table", ["example_library_tasks", "example_library_projects"])
def test_synchronization_repairs_missing_classification_rows(tmp_path, table):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store, project_id=uuid4())
    pin(store, fixed)
    library = ExampleLibrary(store)
    library.synchronize()
    with store.connect() as db:
        db.execute(f"DELETE FROM {table}")
    library.synchronize()
    with store.connect() as db:
        assert db.execute("SELECT job_id FROM example_library_tasks").fetchone()[0] == fixed.id
        assert db.execute("SELECT project_id FROM example_library_projects").fetchone()[0] == str(
            fixed.request.project_id
        )


def test_already_classified_requests_are_still_validated(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store)
    pin(store, fixed)
    library = ExampleLibrary(store)
    library.synchronize()
    with store.connect() as db:
        db.execute("UPDATE jobs SET request='{}' WHERE id=?", (fixed.id,))
    with pytest.raises(ValueError):
        library.synchronize()


def test_concurrent_classification_keeps_the_first_origin_and_timestamp(tmp_path, monkeypatch):
    from opendde_workbench.examples import library as library_module

    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store)
    library = ExampleLibrary(store)

    def concurrent_insert():
        with store.connect() as db:
            db.execute(
                "INSERT INTO example_library_tasks VALUES(?,?,?)",
                (fixed.id, "setup_validation", "original timestamp"),
            )
        return "later timestamp"

    monkeypatch.setattr(library_module, "now", concurrent_insert)
    library.classify([fixed.id])
    with store.connect() as db:
        assert tuple(db.execute("SELECT * FROM example_library_tasks").fetchone()) == (
            fixed.id,
            "setup_validation",
            "original timestamp",
        )
