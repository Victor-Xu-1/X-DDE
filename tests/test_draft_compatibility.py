"""Real old/current application wheels; compatibility checks never install or rewrite."""

import hashlib
import importlib.metadata
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from test_boltz_drafts import snapshot as boltz_snapshot
from test_opendde_drafts import snapshot as opendde_snapshot
from test_prediction_drafts import snapshot as mol1_snapshot

from opendde_workbench.drafts.compatibility import check_draft_compatibility
from opendde_workbench.drafts.storage import DraftStore
from opendde_workbench.store import Store

LEGACY_SHA256 = "5c6db303ebb584b62cfe20a945fac505de03ab72c3243fcf1d7d9f2e8977d66e"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def wheels():
    legacy = Path(os.environ["WB_DRAFT_LEGACY_WHEEL"])
    current = tuple(Path(os.environ["WB_DRAFT_CURRENT_WHEEL_DIR"]).glob("*.whl"))
    assert len(current) == 1, "Build exactly one current application wheel"
    assert sha256(legacy) == LEGACY_SHA256, "Use the actual reviewed 0.8.1 release artifact"
    return legacy, current[0]


@pytest.fixture
def data(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    drafts = DraftStore(store)
    temporary = tmp_path / "private-temporary"
    temporary.mkdir(mode=0o700)
    return store, drafts, temporary


def rows(store):
    with store.connect() as db:
        return db.execute("SELECT * FROM prediction_drafts ORDER BY id").fetchall()


def test_real_legacy_schemas_accept_both_prior_editors_without_any_rewrite(wheels, data):
    legacy, _ = wheels
    store, drafts, temporary = data
    drafts.save(str(uuid4()), mol1_snapshot())
    saved = drafts.save(str(uuid4()), boltz_snapshot())
    drafts.archive(saved.id, saved.revision, True, "boltz.predict")
    before = [tuple(row) for row in rows(store)]
    result = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert result["compatible"] and result["drafts"] == 2 and result["rejected"] == 0
    assert result["target_version"] == "0.8.1" and result["target_sha256"] == LEGACY_SHA256
    assert [tuple(row) for row in rows(store)] == before
    assert list(temporary.iterdir()) == []
    assert sha256(legacy) == LEGACY_SHA256
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 0


@pytest.mark.parametrize("archived", [False, True])
def test_real_previous_wheel_blocks_new_opendde_drafts_even_when_archived(wheels, data, archived):
    legacy, _ = wheels
    store, drafts, temporary = data
    saved = drafts.save(str(uuid4()), opendde_snapshot())
    if archived:
        drafts.archive(saved.id, saved.revision, True, "predict")
    result = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert not result["compatible"] and result["drafts"] == result["rejected"] == 1
    assert result["examples"] == [{"id": saved.id, "reason": "target_schema_rejected"}]
    assert "unfinished" not in json.dumps(result)
    assert list(temporary.iterdir()) == []


def test_actual_current_wheel_accepts_the_complete_three_engine_database(wheels, data):
    _, current = wheels
    store, drafts, temporary = data
    for snapshot in [mol1_snapshot, boltz_snapshot, opendde_snapshot]:
        drafts.save(str(uuid4()), snapshot())
    result = check_draft_compatibility(store.path, current, sha256(current), temporary)
    assert result["compatible"] and result["drafts"] == 3 and result["rejected"] == 0
    assert result["target_version"] == importlib.metadata.version("x-dde")


def test_a_target_that_only_coerces_a_value_cannot_be_called_lossless(wheels, data):
    legacy, _ = wheels
    store, drafts, temporary = data
    saved = drafts.save(str(uuid4()), mol1_snapshot())
    with store.connect() as db:
        original = json.loads(db.execute("SELECT body FROM prediction_drafts").fetchone()[0])
        original["state"]["components"][0]["count"] = "1"
        db.execute(
            "UPDATE prediction_drafts SET body=? WHERE id=?", (json.dumps(original), saved.id)
        )
    result = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert not result["compatible"] and result["rejected"] == 1
    with store.connect() as db:
        assert (
            json.loads(db.execute("SELECT body FROM prediction_drafts").fetchone()[0]) == original
        )


def test_snapshot_changes_when_a_new_draft_arrives_between_preflight_and_quiescence(wheels, data):
    legacy, _ = wheels
    store, drafts, temporary = data
    first = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert first["compatible"] and first["drafts"] == 0
    drafts.save(str(uuid4()), opendde_snapshot())
    final = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert not final["compatible"] and final["snapshot_sha256"] != first["snapshot_sha256"]


def test_digest_mismatch_or_missing_database_never_creates_or_changes_data(wheels, data, tmp_path):
    legacy, _ = wheels
    store, _, temporary = data
    with pytest.raises(ValueError, match="reviewed SHA-256"):
        check_draft_compatibility(store.path, legacy, "0" * 64, temporary)
    missing = tmp_path / "missing.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        check_draft_compatibility(missing, legacy, LEGACY_SHA256, temporary)
    assert not missing.exists() and list(temporary.iterdir()) == []


def test_child_reads_the_verified_private_copy_if_the_source_wheel_changes(
    wheels, data, tmp_path, monkeypatch
):
    legacy, _ = wheels
    store, drafts, temporary = data
    drafts.save(str(uuid4()), mol1_snapshot())
    mutable = tmp_path / "mutable.whl"
    shutil.copyfile(legacy, mutable)
    from opendde_workbench.drafts.compatibility_process import run_probe

    def mutate_original(arguments, **kwargs):
        assert "-I" in arguments and "-B" in arguments
        assert Path(arguments[-1]).parent.is_relative_to(temporary)
        mutable.write_bytes(b"replaced after the verified private copy was created")
        return run_probe(arguments, **kwargs)

    monkeypatch.setattr("opendde_workbench.drafts.compatibility.run_probe", mutate_original)
    result = check_draft_compatibility(store.path, mutable, LEGACY_SHA256, temporary)
    assert result["compatible"] and result["target_sha256"] == LEGACY_SHA256


def test_cli_refuses_incompatible_target_without_printing_scientific_input(wheels, data):
    legacy, _ = wheels
    store, drafts, temporary = data
    value = opendde_snapshot()
    value.state.name = "PRIVATE_STUDY_NAME_DO_NOT_LOG"
    drafts.save(str(uuid4()), value)
    command = [
        sys.executable,
        "-B",
        "scripts/check-draft-compatibility.py",
        "--database",
        str(store.path),
        "--wheel",
        str(legacy),
        "--sha256",
        LEGACY_SHA256,
        "--temporary-directory",
        str(temporary),
    ]
    blocked = subprocess.run(command, capture_output=True, text=True, check=False, timeout=40)
    assert blocked.returncode == 1
    assert json.loads(blocked.stdout)["rejected"] == 1
    assert "PRIVATE_STUDY" not in blocked.stdout + blocked.stderr
    assert "MSLWGLVSKMPPEK" not in blocked.stdout + blocked.stderr


def test_incomplete_child_report_or_snapshot_budget_never_approves_partial_validation(
    wheels, data, monkeypatch
):
    legacy, _ = wheels
    store, drafts, temporary = data
    drafts.save(str(uuid4()), mol1_snapshot())
    monkeypatch.setattr(
        "opendde_workbench.drafts.compatibility.run_probe",
        lambda arguments, **kwargs: b'{"drafts":0,"rejected":0,"examples":[]}',
    )
    with pytest.raises(ValueError, match="complete snapshot"):
        check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    monkeypatch.setattr("opendde_workbench.drafts.compatibility.MAX_SNAPSHOT_BYTES", 1)
    with pytest.raises(ValueError, match="guard budget"):
        check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert list(temporary.iterdir()) == []
    assert len(rows(store)) == 1


@pytest.mark.parametrize("missing", [False, True])
def test_cli_reports_incomplete_sqlite_inspection_as_exit_two(wheels, data, tmp_path, missing):
    legacy, _ = wheels
    _, _, temporary = data
    database = tmp_path / "unreadable.sqlite3"
    if not missing:
        database.write_bytes(b"not a SQLite database")
    command = [
        sys.executable,
        "-B",
        "scripts/check-draft-compatibility.py",
        "--database",
        str(database),
        "--wheel",
        str(legacy),
        "--sha256",
        LEGACY_SHA256,
        "--temporary-directory",
        str(temporary),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=40)
    assert result.returncode == 2 and result.stderr == ""
    assert json.loads(result.stdout) == {
        "compatible": False,
        "reason": "OperationalError" if missing else "DatabaseError",
    }
    assert database.exists() is not missing
    if not missing:
        assert database.read_bytes() == b"not a SQLite database"
    assert list(temporary.iterdir()) == []


def test_wheel_copy_cannot_exceed_its_private_storage_budget(wheels, data, monkeypatch):
    legacy, _ = wheels
    store, _, temporary = data
    monkeypatch.setattr("opendde_workbench.drafts.compatibility.MAX_WHEEL_BYTES", 16)
    with pytest.raises(ValueError, match="wheel exceeds"):
        check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert list(temporary.iterdir()) == []


def test_archived_rows_are_all_checked_even_when_rejection_examples_are_bounded(wheels, data):
    legacy, _ = wheels
    store, drafts, temporary = data
    for _ in range(35):
        saved = drafts.save(str(uuid4()), opendde_snapshot())
        drafts.archive(saved.id, saved.revision, True, "predict")
    result = check_draft_compatibility(store.path, legacy, LEGACY_SHA256, temporary)
    assert not result["compatible"]
    assert result["drafts"] == result["rejected"] == 35 and len(result["examples"]) == 32
