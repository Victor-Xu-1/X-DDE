"""Computational frame covariance and identity, without native scientific claims."""

import math

import pytest

from opendde_workbench.space.pdb_frame import canonical_pdb, source_position


def structure(points):
    names = ("N", "CA", "C", "O")
    return (
        "\n".join(
            f"ATOM  {i + 1:5d} {name:^4s} ALA A   1    "
            f"{p[0]:8.3f}{p[1]:8.3f}{p[2]:8.3f}  1.00 20.00           {name[0]}  "
            for i, (name, p) in enumerate(zip(names, points, strict=True))
        )
        + "\nEND\n"
    ).encode("ascii")


POSITIONS = [(1, 2, 3), (1, 1, 3), (2, 1, 3), (2, 1, 4)]
SOURCE = structure(POSITIONS)


def test_proper_frame_preserves_original_identity_and_restores_coordinates():
    copy = bytes(SOURCE)
    native, frame = canonical_pdb(SOURCE, (1, 1, 3))
    assert SOURCE == copy
    for before, after in zip(SOURCE.splitlines(), native.splitlines(), strict=True):
        if before.startswith(b"ATOM"):
            assert before[:30] == after[:30] and before[54:] == after[54:]
            xyz = [float(after[start : start + 8]) for start in (30, 38, 46)]
            expected = [float(before[start : start + 8]) for start in (30, 38, 46)]
            assert math.dist(source_position(xyz, frame), expected) < 1e-12
    assert frame["basis"] == [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def test_common_translation_and_quarter_rotation_produce_identical_native_geometry():
    native, _ = canonical_pdb(SOURCE, (1, 1, 3))
    moved = [(-y + 25, x - 15, z + 8) for x, y, z in POSITIONS]
    transformed, _ = canonical_pdb(structure(moved), (24, -14, 11))
    assert transformed == native


@pytest.mark.parametrize("origin", [(float("nan"), 0, 0), (True, 0, 0), (0, 0), (1e6, 0, 0)])
def test_invalid_source_frame_is_never_replaced_by_a_default(origin):
    with pytest.raises(ValueError):
        canonical_pdb(SOURCE, origin)


def test_unrepresentable_native_positions_are_rejected_without_truncating():
    with pytest.raises(ValueError, match="faithfully"):
        canonical_pdb(SOURCE, (-100000, 0, 0))


def test_collinear_backbone_does_not_receive_an_invented_world_frame():
    with pytest.raises(ValueError, match="non-collinear"):
        canonical_pdb(structure([(0, 0, 0), (1, 0, 0), (2, 0, 0), (3, 0, 0)]), (0, 0, 0))
