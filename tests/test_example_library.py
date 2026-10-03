"""Examples remain accessible evidence without polluting personal task pagination."""

import json
from uuid import uuid4

import pytest

from opendde_workbench.examples.catalogue import MODULES
from opendde_workbench.examples.library import ExampleLibrary
from opendde_workbench.requests import Properties
from opendde_workbench.store import Store


def create(store, name="BRD4 personal analysis", project_id=None):
    return store.create(
        Properties(name=name, smiles=["c1ccccc1"], project_id=project_id), str(uuid4()), 50, 100
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
            ("properties", MODULES["properties"].revision, json.dumps({"job_id": fixed.id})),
        )
    library = ExampleLibrary(store)
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]
    assert store.get(fixed.id).status == fixed.status
    assert store.claim(fixed.id) is not None


def test_new_tasks_using_template_inputs_are_not_automatically_examples(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    fixed = create(store, project_id=uuid4())
    library = ExampleLibrary(store)
    library.classify([fixed.id])
    fresh = store.create(
        fixed.request.model_copy(update={"project_id": None}), str(uuid4()), 50, 100
    )
    assert [job.id for job in library.personal_jobs(20, 0)] == [fresh.id]


def test_invalid_classification_rolls_back_without_losing_history(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    user = create(store)
    library = ExampleLibrary(store)
    with pytest.raises(ValueError, match="unknown example"):
        library.classify([user.id, str(uuid4())])
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]


def test_user_jobs_in_a_shared_project_are_never_classified_by_project_name(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    project = uuid4()
    fixed = create(store, project_id=project)
    user = create(store, project_id=project)
    library = ExampleLibrary(store)
    library.classify([fixed.id], "setup_validation")
    assert [job.id for job in library.personal_jobs(20, 0)] == [user.id]
