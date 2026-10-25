"""Physical frame invariance and exact partner identity for alternate anchors."""

from copy import deepcopy

import numpy as np
import pytest

from opendde_workbench.proximity.native_frames import (
    canonical_prediction,
    local_binary_coordinates,
    pocket_in_ligand_frame,
)


def geometry():
    arm = np.array([[0.0, 0.0, 0.0], [1.4, 0.0, 0.0], [0.0, 1.5, 0.0], [0.2, 0.3, 1.3]])
    rotation = np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    mapping = [4, 1, 3, 0]
    whole = np.zeros((6, 3))
    whole[mapping] = arm @ rotation.T + np.array([7.0, -15.0, 21.0])
    return arm, mapping, whole, rotation


def test_separate_binary_coordinates_are_placed_by_chemical_identity_not_world_proximity():
    arm, mapping, whole, _ = geometry()
    observed = arm + np.array([180.0, -350.0, 80.0])
    selected = [0, 1, 3, 4]
    original = observed.copy(), whole.copy()
    actual = pocket_in_ligand_frame(observed, mapping, whole, selected)
    np.testing.assert_allclose(actual, whole[selected], atol=1e-10)
    assert np.array_equal(observed, original[0]) and np.array_equal(whole, original[1])


def test_independent_full_input_translation_cancels_from_randomized_ligand_and_its_pockets():
    arm, mapping, whole, rotation = geometry()
    selected = [0, 1, 3, 4]
    source = pocket_in_ligand_frame(arm, mapping, whole, selected)
    offset = np.array([350.0, -120.0, 80.0])
    shifted = pocket_in_ligand_frame(arm, mapping, whole + offset, selected)
    first = (source - whole.mean(0)) @ rotation.T
    second = (shifted - (whole + offset).mean(0)) @ rotation.T
    np.testing.assert_allclose(first, second, atol=1e-10)


def test_pocket_geometry_survives_a_rotated_initialized_ligand_frame_without_reflection():
    arm, mapping, whole, rotation = geometry()
    selected = [0, 1, 3, 4]
    original = pocket_in_ligand_frame(arm, mapping, whole, selected)
    changed = pocket_in_ligand_frame(arm, mapping, whole @ rotation.T, selected)
    np.testing.assert_allclose(changed, original @ rotation.T, atol=1e-10)
    a = np.linalg.norm(original[:, None, :] - original[None, :, :], axis=2)
    b = np.linalg.norm(arm[:, None, :] - arm[None, :, :], axis=2)
    np.testing.assert_allclose(np.sort(a.flatten()), np.sort(b.flatten()), atol=1e-10)


@pytest.mark.parametrize(
    "mapping,selected",
    [
        ([0, 0, 2, 3], [0, 2, 3]),
        ([0, 1, 2, 9], [0, 1, 2]),
        ([0, 1, 2, 3], [0, 1, 5]),
        ([0, 1, 2, 3], [0, 1, 1]),
    ],
)
def test_ambiguous_or_out_of_range_atom_maps_are_rejected(mapping, selected):
    arm, _, whole, _ = geometry()
    with pytest.raises(ValueError):
        pocket_in_ligand_frame(arm, mapping, whole, selected)


def test_degenerate_pocket_alignment_is_not_silently_invented():
    arm = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [2.0, 0.0, 0.0]])
    with pytest.raises(ValueError, match="non-collinear"):
        pocket_in_ligand_frame(arm, [0, 1, 2], arm, [0, 1, 2])


def test_alternate_anchor_restores_the_original_a_frame_and_all_inter_partner_distances():
    a, _, b, rotation = geometry()
    offset = np.array([17.0, -9.0, 23.0])
    ligand = b[:3] + np.array([1.0, 3.0, 5.0])
    native = {
        "rotation": rotation,
        "translation": offset.reshape(1, 3),
        "ligand_positions": ligand @ rotation.T + offset,
        "seed": 31,
        "ranking_surrogate": 4.2,
    }
    snapshot = deepcopy(native)
    actual = canonical_prediction(native, "b")
    assert actual["translation"].shape == (1, 3), "Preserve the native transform ABI."
    np.testing.assert_allclose(actual["ligand_positions"], ligand, atol=1e-12)
    # Native partner 2 is original A; the output keeps original A unchanged.
    a_native = a @ rotation.T + offset
    a_restored = a_native @ actual["rotation"].T + actual["translation"]
    np.testing.assert_allclose(a_restored, a, atol=1e-12)
    b_restored = b @ actual["rotation"].T + actual["translation"]
    before = np.linalg.norm(a_native[:, None, :] - b[None, :, :], axis=2)
    after = np.linalg.norm(a[:, None, :] - b_restored[None, :, :], axis=2)
    np.testing.assert_allclose(before, after, atol=1e-12)
    for key in ("rotation", "translation", "ligand_positions"):
        assert np.array_equal(native[key], snapshot[key])
    assert actual["seed"] == 31 and actual["ranking_surrogate"] == 4.2


@pytest.mark.parametrize("rotation", [np.diag([-1.0, 1.0, 1.0]), np.eye(3) * 2, np.ones((2, 2))])
def test_invalid_native_transforms_cannot_be_reinterpreted_as_an_alternate_anchor(rotation):
    with pytest.raises(ValueError, match="proper native"):
        canonical_prediction(
            {
                "rotation": rotation,
                "translation": np.zeros(3),
                "ligand_positions": np.zeros((3, 3)),
            },
            "b",
        )


def test_native_precision_binary_translations_have_identical_local_model_input():
    # Cancellation at a large world origin must not reach float32/SVD/model correction.
    source = np.array(
        [
            [1.2334, -24.8271, 13.1256],
            [2.7275, -24.5367, 12.1104],
            [0.7913, -23.9274, 14.3357],
            [0.0996, -25.1268, 13.3369],
        ]
    )
    before = source.copy()
    actual = local_binary_coordinates(source)
    for offset in ([350.0, -120.0, 80.0], [90000.0, -80000.0, 60000.0]):
        np.testing.assert_array_equal(actual, local_binary_coordinates(source + offset))
    np.testing.assert_allclose(actual, source - source[0], atol=1e-8, rtol=0)
    np.testing.assert_array_equal(source, before)
    np.testing.assert_allclose(
        np.linalg.norm(actual[:, None, :] - actual[None, :, :], axis=2),
        np.linalg.norm(source[:, None, :] - source[None, :, :], axis=2),
        atol=2e-8,
        rtol=0,
    )


@pytest.mark.parametrize(
    "points", [np.zeros((2, 3)), np.zeros((3, 2)), np.full((3, 3), np.nan), np.full((3, 3), 100001)]
)
def test_binary_local_frame_rejects_invalid_coordinates_without_mutating_them(points):
    before = points.copy()
    with pytest.raises(ValueError, match="finite, bounded"):
        local_binary_coordinates(points)
    np.testing.assert_array_equal(points, before)
