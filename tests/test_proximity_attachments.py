"""Coordinate/frame controls for source-backed read-only boundary measurements."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from opendde_workbench.proximity.attachment_geometry import AttachmentBond, boundary_bonds
from opendde_workbench.proximity.presentation import present_ternary


def geometry():
    graph = {
        "atoms": ["C", "N", "C", "O", "C", "N"],
        "bonds": [(0, 1, 1), (1, 2, 1), (2, 3, 1), (3, 4, 1), (4, 5, 1)],
    }
    indices = [3, 5, 8, 11, 12, 14]
    arms = [[3, 5], [12, 14]]
    points = [(0, 0, 0), (1, 0, 0), (2, 1, 0), (3, 1, 0), (4, 1, 0), (5, 2, 0)]
    return graph, indices, arms, points


def test_cut_bonds_preserve_original_atom_ids_and_measured_direction():
    graph, indices, arms, points = geometry()
    original = deepcopy((graph, indices, arms, points))
    rows = boundary_bonds(graph, indices, arms, points)
    assert [(row["region_atom"], row["outside_atom"]) for row in rows] == [(5, 8), (12, 11)]
    assert rows[0]["direction"] == pytest.approx([2**-0.5, 2**-0.5, 0])
    assert rows[1]["direction"] == [-1, 0, 0]
    assert (graph, indices, arms, points) == original


def test_common_translation_and_rotation_preserve_distances_and_rotate_directions():
    graph, indices, arms, points = geometry()
    rows = boundary_bonds(graph, indices, arms, points)
    moved = [(-y + 500, x - 250, z + 100) for x, y, z in points]
    transformed = boundary_bonds(graph, indices, arms, moved)
    for old, new in zip(rows, transformed, strict=True):
        x, y, z = old["direction"]
        assert new["direction"] == pytest.approx([-y, x, z])
        assert new["bond_length_angstrom"] == pytest.approx(old["bond_length_angstrom"])


def test_coincident_endpoints_do_not_invent_a_world_axis():
    graph, indices, arms, points = geometry()
    points[2] = points[1]
    row = boundary_bonds(graph, indices, arms, points)[0]
    assert row["direction"] is None and row["bond_length_angstrom"] == 0


@pytest.mark.parametrize("invalid", ["missing_atom", "overlap", "nonfinite", "multiple_bond"])
def test_inconsistent_or_unsupported_source_geometry_is_rejected(invalid):
    graph, indices, arms, points = geometry()
    if invalid == "missing_atom":
        indices.pop()
    if invalid == "overlap":
        arms[1].append(5)
    if invalid == "nonfinite":
        points[2] = (float("nan"), 0, 0)
    if invalid == "multiple_bond":
        graph["bonds"][1] = (1, 2, 2)
    with pytest.raises(ValueError):
        boundary_bonds(graph, indices, arms, points)


def test_fabricated_direction_cannot_pass_the_measurement_contract():
    row = boundary_bonds(*geometry())[0]
    row["direction"] = [0, 0, 1]
    with pytest.raises(ValidationError):
        AttachmentBond.model_validate(row)


def test_glue_view_does_not_invent_compulsory_two_arm_geometry(tmp_path):
    value = {"proximity": {"mechanism": "molecular_glue", "arm_maps": [], "assemblies": []}}
    assert present_ternary(value, tmp_path) is value
    assert "attachment_geometry" not in value["proximity"]
