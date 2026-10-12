"""Archived preview fixture identity stays independent of current template pins."""

import hashlib
import json
import sqlite3

import pytest

from server_tests.retained_native_case import retained_native_case


def database(tmp_path, rows):
    path = tmp_path / "jobs.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE jobs(id TEXT,request TEXT,status TEXT)")
        db.executemany("INSERT INTO jobs VALUES (?,?,?)", rows)
    return path


def test_archive_identity_does_not_require_or_write_a_current_template_pin(tmp_path):
    path = database(
        tmp_path,
        [
            ("old-native", json.dumps({"operation": "del_validate"}), "succeeded"),
            ("failed", json.dumps({"operation": "del_validate"}), "failed"),
            ("other", json.dumps({"operation": "del_decode"}), "succeeded"),
        ],
    )
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert retained_native_case(tmp_path, "del.library") == "old-native"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest


@pytest.mark.parametrize("count", [0, 2])
def test_missing_or_ambiguous_archive_is_not_replaced_by_an_arbitrary_task(tmp_path, count):
    database(
        tmp_path,
        [(str(i), json.dumps({"operation": "del_validate"}), "succeeded") for i in range(count)],
    )
    with pytest.raises(ValueError, match="Require one genuine"):
        retained_native_case(tmp_path, "del.library")


def test_unbounded_state_is_rejected(tmp_path):
    database(
        tmp_path,
        [(str(i), json.dumps({"operation": "del_decode"}), "succeeded") for i in range(501)],
    )
    with pytest.raises(ValueError, match="bounded isolated"):
        retained_native_case(tmp_path, "del.library")
