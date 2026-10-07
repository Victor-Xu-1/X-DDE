"""CSV trust and resource boundaries only; native CAVER protocol has its own CI gate."""

import csv

import pytest

from opendde_workbench.space.caver_profiles import AXES, HEADER, read_profiles


def fixture(path):
    rows = [list(HEADER)]
    values = {
        "X": ["0", "1"],
        "Y": ["0", "0"],
        "Z": ["0", "0"],
        "distance": ["0", "1"],
        "length": ["0", "1"],
        "R": ["1", "1"],
        "Upper limit of R overestimation": ["-", "-"],
    }
    for axis in sorted(AXES):
        rows.append(
            ["one.pdb", "1", "1", "1", "0", "1", "-", "-", "-", "1", "2", "", axis, *values[axis]]
        )
    write(path, rows)
    return rows


def write(path, rows):
    with path.open("w", newline="") as stream:
        csv.writer(stream).writerows(rows)


def test_unknown_numerical_error_is_not_reported_as_zero(tmp_path):
    path = tmp_path / "profile.csv"
    fixture(path)
    value = read_profiles(path, "one.pdb")[0]
    assert value["radius_error_bounds_angstrom"] == [None, None, None]
    assert all(point["radius_error_bound_angstrom"] is None for point in value["points"])


@pytest.mark.parametrize(
    "change",
    [
        "other_structure",
        "nan",
        "duplicate_axis",
        "unknown_axis",
        "incomplete_axis",
        "budget",
        "negative_error",
    ],
)
def test_untrusted_or_incomplete_native_profiles_are_rejected(tmp_path, change):
    path = tmp_path / "profile.csv"
    rows = fixture(path)
    kwargs = {}
    if change == "other_structure":
        rows[1][0] = "another.pdb"
    elif change == "nan":
        rows[1][-1] = "NaN"
    elif change == "duplicate_axis":
        rows.append(rows[1])
    elif change == "unknown_axis":
        rows[1][12] = "force"
    elif change == "incomplete_axis":
        rows.pop()
    elif change == "budget":
        kwargs["maximum_points"] = 1
    elif change == "negative_error":
        next(row for row in rows[1:] if row[12] == "Upper limit of R overestimation")[-1] = "-1"
    write(path, rows)
    with pytest.raises(ValueError):
        read_profiles(path, "one.pdb", **kwargs)


def test_missing_native_output_does_not_become_no_solution(tmp_path):
    with pytest.raises(ValueError):
        read_profiles(tmp_path / "missing.csv", "one.pdb")
