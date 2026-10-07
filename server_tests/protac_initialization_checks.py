"""Independent source-frame checks on actual RDKit conformers and native graphs."""

from copy import deepcopy

import numpy as np
import torch
from deepternary.models.geometry_utils import random_rotation_translation
from native_proximity_chemistry import aligned_arm_conformer, fixed_arm_conformer
from native_proximity_graphs import load_model, partner_graph, proposal
from predict import get_lig_graph_protac
from rdkit import Chem


def independent_alignment(moving, target):
    """Row-vector Kabsch reference, independent of the native column-vector helper."""
    origin, destination = moving.mean(axis=0), target.mean(axis=0)
    left, _, right = np.linalg.svd((moving - origin).T @ (target - destination))
    correction = np.eye(3)
    correction[2, 2] = np.linalg.det(left @ right)
    rotation = left @ correction @ right
    return (moving - origin) @ rotation + destination


def verify_initialization(full, arms, partners, seed):
    observed = full.GetConformer().GetPositions().copy()
    arm_positions = [arm.GetConformer().GetPositions().copy() for arm, _ in arms]
    generated = fixed_arm_conformer(full, arms, seed)
    moving = generated.GetConformer().GetPositions().copy()
    expected = independent_alignment(moving, observed)
    aligned = aligned_arm_conformer(full, arms, seed)
    actual = aligned.GetConformer().GetPositions()
    assert np.allclose(actual, expected, atol=0.00001, rtol=0)
    assert np.allclose(actual.mean(axis=0), observed.mean(axis=0), atol=0.00001, rtol=0)
    before = np.linalg.norm(moving[:, None, :] - moving[None, :, :], axis=2)
    after = np.linalg.norm(actual[:, None, :] - actual[None, :, :], axis=2)
    assert np.allclose(before, after, atol=0.00001, rtol=0), "Alignment must not alter geometry."
    assert Chem.MolToSmiles(aligned, isomericSmiles=True) == Chem.MolToSmiles(
        full, isomericSmiles=True
    )
    # A translated reference must translate the initialization without moving the
    # saved source molecule or introducing a world-axis-dependent frame.
    translated = deepcopy(full)
    offset = np.array([350.0, -120.0, 80.0])
    for index, position in enumerate(observed + offset):
        translated.GetConformer().SetAtomPosition(index, position)
    shifted = aligned_arm_conformer(translated, arms, seed).GetConformer().GetPositions()
    assert np.allclose(shifted, actual + offset, atol=0.00001, rtol=0)
    assert np.array_equal(full.GetConformer().GetPositions(), observed)
    assert all(
        np.array_equal(arm.GetConformer().GetPositions(), positions)
        for (arm, _), positions in zip(arms, arm_positions, strict=True)
    )

    cfg, _ = load_model(False)
    config = cfg.test_dataloader.dataset
    graphs = [partner_graph(partner, config) for partner in partners]
    torch.manual_seed(seed)
    np.random.seed(seed)
    reference_molecule = deepcopy(generated)
    for index, position in enumerate(expected):
        reference_molecule.GetConformer().SetAtomPosition(index, position)
    _, reference = get_lig_graph_protac(
        reference_molecule,
        name="X_DDE",
        max_neighbors=config.lig_max_neighbors,
        radius=config.lig_graph_radius,
        use_rdkit_coords=False,
        use_random_coords=False,
        seed=seed,
    )
    initialized = reference.ndata["x"].clone()
    rotation, translation = random_rotation_translation(translation_distance=5)
    expected_input = (
        rotation @ (initialized - initialized.mean(dim=0, keepdims=True)).T
    ).T + translation
    data, _ = proposal(full, arms, graphs, cfg, seed)
    ligand = data["lig_graph"]
    assert np.allclose(ligand.ndata["x"].numpy(), observed, atol=0.00001, rtol=0)
    assert torch.allclose(ligand.ndata["new_x"], expected_input, atol=0.0001, rtol=0)
    assert all(torch.equal(a, b) for a, b in zip(ligand.edges(), reference.edges(), strict=True))
    assert torch.allclose(ligand.edata["feat"], reference.edata["feat"], atol=0.00001, rtol=0)
    assert torch.allclose(
        ligand.ndata["mu_r_norm"], reference.ndata["mu_r_norm"], atol=0.00001, rtol=0
    )
    return {
        "observed_and_generated_frames_distinct": True,
        "independent_kabsch_reference_passed": True,
        "initial_graph_and_coordinate_reference_passed": True,
        "source_poses_unchanged": True,
        "initial_geometry_unchanged": True,
        "unplaced_conformer_centroid_displacement_angstrom": float(
            np.linalg.norm(moving.mean(axis=0) - observed.mean(axis=0))
        ),
        "scientific_prediction_accuracy_accepted": False,
    }
