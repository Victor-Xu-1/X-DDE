"""Reviewed DeepTernary featurizers with explicit chemical-arm correspondence."""

from copy import deepcopy

import numpy as np
import torch
from deepternary.models.geometry_utils import random_rotation_translation
from deepternary.models.process_mols import (
    get_geometry_graph_ring,
    get_rec_graph,
    get_receptor_inference,
)
from deepternary.models.ternary_pdb import get_pocket_and_mask
from native_proximity_chemistry import fixed_arm_conformer


def load_model(glue):
    from predict import _load_model

    config = "/opt/native/deepternary/configs/" + ("glue.py" if glue else "protac.py")
    checkpoint = "/models/" + ("glue.pth" if glue else "protac.pth")
    cfg, model = _load_model(config, checkpoint, "cpu")
    if cfg.test_dataloader.dataset.use_rec_atoms:
        raise ValueError("This reviewed protocol requires the exact CA-node model graph.")
    return cfg, model


def partner_graph(partner, config):
    values = get_receptor_inference(str(partner["file"]))
    recs, coordinates, alpha, nitrogen, carbon = values
    expected = np.asarray([residue["CA"].coord for residue in partner["model"].get_residues()])
    if np.asarray(alpha).shape != expected.shape or not np.allclose(
        alpha, expected, atol=0.001, rtol=0
    ):
        raise ValueError(
            "Native graph nodes no longer correspond to the selected observed residues."
        )
    graph = get_rec_graph(
        recs,
        coordinates,
        alpha,
        nitrogen,
        carbon,
        use_rec_atoms=False,
        rec_radius=config.rec_graph_radius,
        surface_max_neighbors=config.surface_max_neighbors,
        surface_graph_cutoff=config.surface_graph_cutoff,
        surface_mesh_cutoff=config.surface_mesh_cutoff,
        c_alpha_max_neighbors=config.c_alpha_max_neighbors,
    )
    if graph.ndata["x"].shape != expected.shape:
        raise ValueError("Native protein graph changed its confirmed residue correspondence.")
    return graph


def mapped_pocket(arm, mapping, protein, count, cutoff):
    coordinates = torch.from_numpy(arm.GetConformer().GetPositions()).float()
    _, local_mask, protein_mask = get_pocket_and_mask(coordinates, protein, cutoff=cutoff)
    selected = [(mapping[i], coordinates[i]) for i in range(len(mapping)) if local_mask[i]]
    selected.sort(key=lambda row: row[0])
    if len(selected) < 3 or torch.count_nonzero(protein_mask) < 3:
        raise ValueError("The binary arm has insufficient observed native pocket support.")
    full_mask = torch.zeros(count, dtype=torch.bool)
    full_mask[[row[0] for row in selected]] = True
    return full_mask, torch.stack([row[1] for row in selected]), protein_mask


def proposal(full, arms, partners, cfg, seed):
    from predict import get_lig_graph_protac, get_lig_graph_revised

    torch.manual_seed(seed)
    np.random.seed(seed)
    generated = fixed_arm_conformer(full, arms, seed)
    config = cfg.test_dataloader.dataset
    graph_function = get_lig_graph_protac if arms else get_lig_graph_revised
    molecule, ligand = graph_function(
        generated,
        name="X_DDE",
        max_neighbors=config.lig_max_neighbors,
        radius=config.lig_graph_radius,
        use_rdkit_coords=False,
        use_random_coords=False,
        seed=seed,
    )
    if molecule.GetNumAtoms() != full.GetNumAtoms():
        raise ValueError("Native ligand featurization changed the complete atom correspondence.")
    # With an already generated, exact constrained conformer the official featurizer
    # keeps coordinates in x. The model's initialized pose input is explicitly new_x.
    ligand.ndata["new_x"] = ligand.ndata["x"].clone()
    first, second = [deepcopy(graph) for graph in partners]
    geometry = get_geometry_graph_ring(molecule)
    count = full.GetNumAtoms()
    data = {
        "lig_graph": ligand,
        "rec_graph": first,
        "rec2_graph": second,
        "geometry_graph": geometry,
        "complex_name": ["X_DDE"],
        "rec2_coords": [second.ndata["x"].clone()],
        "rec2_coords_input": [second.ndata["x"]],
    }
    for index, prefix in ((0, "p1"), (1, "p2")):
        native_graph = first if index == 0 else second
        if arms:
            arm, mapping = arms[index]
            mask, coordinates, protein_mask = mapped_pocket(
                arm,
                mapping,
                native_graph.ndata["x"],
                count,
                config.pocket_cutoff,
            )
        else:
            mask = torch.zeros(count, dtype=torch.bool)
            coordinates = ligand.ndata["x"][0:0]
            protein_mask = torch.zeros(native_graph.ndata["x"].shape[0], dtype=torch.bool)
        data[prefix + "lig_lig_pocket_mask"] = [mask]
        data[prefix + "lig_lig_pocket_coords"] = [coordinates.clone()]
        data[prefix + "lig_" + prefix + "_pocket_mask"] = [protein_mask]
        data[prefix + "lig_" + prefix + "_pocket_coords"] = [coordinates.clone()]
    # Use the official rigid initialization policy; retain exact atom masks.
    rotation, translation = random_rotation_translation(translation_distance=5)
    center = ligand.ndata["new_x"].mean(dim=0, keepdims=True)
    ligand.ndata["new_x"] = (rotation @ (ligand.ndata["new_x"] - center).T).T + translation
    for prefix in ("p1", "p2"):
        points = data[prefix + "lig_lig_pocket_coords"][0]
        data[prefix + "lig_lig_pocket_coords"][0] = (rotation @ (points - center).T).T + translation
    rotation, translation = random_rotation_translation(translation_distance=5)
    center = second.ndata["x"].mean(dim=0, keepdims=True)
    second.ndata["x"] = (rotation @ (second.ndata["x"] - center).T).T + translation
    points = data["p2lig_p2_pocket_coords"][0]
    data["p2lig_p2_pocket_coords"][0] = (rotation @ (points - center).T).T + translation
    data["rec2_coords_input"] = [second.ndata["x"]]
    return data, molecule
