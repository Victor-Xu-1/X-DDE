"""Actual readonly member pagination, literal search and truthful index columns."""

import sqlite3
from types import SimpleNamespace

import pytest

from opendde_workbench.datasets.member_view import member_page


def index_database(root):
    file = root / "index-members.sqlite"
    with sqlite3.connect(file) as db:
        db.execute(
            "CREATE TABLE members (ordinal INTEGER,id TEXT,smiles TEXT,display_name TEXT,"
            "supplier TEXT,source_record INTEGER,source_job TEXT)"
        )
        db.executemany(
            "INSERT INTO members VALUES (?,?,?,?,?,?,?)",
            [
                (
                    0,
                    "i0",
                    "COc1ccc2ncnc(Nc3ccc(F)c(Cl)c3)c2c1",
                    "EGFR_100%",
                    "supplier-A",
                    17,
                    "original-study",
                ),
                (
                    1,
                    "i1",
                    "Cc1ccc(NC(=O)c2cccnc2)cc1",
                    "ABL_200",
                    "supplier-B",
                    8,
                    "original-study",
                ),
                (
                    2,
                    "i2",
                    "CN1CCN(c2ccc(NC(=O)c3ccccc3)cc2)CC1",
                    "ABLX200",
                    "supplier-C",
                    12,
                    "original-study",
                ),
            ],
        )
    return file, SimpleNamespace(data_kind="index", counts={"indexed": 3})


def test_index_members_are_native_records_without_fabricated_properties(tmp_path):
    file, result = index_database(tmp_path)
    original = file.read_bytes()
    first = member_page(tmp_path, result, limit=2, offset=0, search="", order="record")
    assert [row["id"] for row in first["rows"]] == ["i0", "i1"]
    assert first["total"] == 3 and first["has_more"]
    assert first["rows"][0]["source_record"] == 17
    assert not {"mw", "logp", "qed", "score", "shard"} & first["rows"][0].keys()
    assert (
        member_page(tmp_path, result, limit=2, offset=2, search="", order="record")["rows"][0]["id"]
        == "i2"
    )
    assert file.read_bytes() == original


@pytest.mark.parametrize(
    "search,expected",
    [("100%", ["i0"]), ("ABL_200", ["i1"]), ("supplier-C", ["i2"]), ("' OR 1=1 --", [])],
)
def test_index_search_is_literal_and_parameterized(tmp_path, search, expected):
    _, result = index_database(tmp_path)
    page = member_page(tmp_path, result, limit=20, offset=0, search=search, order="record")
    assert [row["id"] for row in page["rows"]] == expected


def test_index_has_no_descriptor_sort_and_other_roles_cannot_be_member_libraries(tmp_path):
    _, result = index_database(tmp_path)
    with pytest.raises(ValueError, match="descriptor ordering"):
        member_page(tmp_path, result, limit=20, offset=0, search="", order="mw")
    result.data_kind = "analysis"
    with pytest.raises(ValueError, match="prepared or indexed"):
        member_page(tmp_path, result, limit=20, offset=0, search="", order="record")
