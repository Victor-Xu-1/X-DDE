"""Real official MGD graph/forward parity and complete X-DDE native execution."""

import json
import random
import runpy
import sys
from copy import deepcopy
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, "/platform")
from deepternary.models.correct import correct_ligand
from deepternary.models.rotate_utils import rotate_and_translate
from native_proximity_chemistry import read_chemistry
from native_proximity_graphs import load_model, partner_graph, proposal
from native_proximity_partners import read_partner
from native_proximity_prediction import predict_one
from native_proximity_quality import check_candidate
from predict import get_lig_graph_revised


def main():
    request = json.loads(Path("/input/request.json").read_text())
    assert request["payload"]["mechanism"] == "molecular_glue"
    torch.set_num_threads(request["options"]["cpu"])
    full, _, arms = read_chemistry(request)
    assert not arms, "A molecular glue must not invent two chemically distinct arms."
    expected_count = 19 if request["payload"]["partner_b_name"] == "CK1alpha" else 31
    assert full.GetNumAtoms() == expected_count
    original = full.GetConformer().GetPositions().copy()
    partners = [read_partner(request, role) for role in ("a", "b")]
    cfg, model = load_model(True)
    config = cfg.test_dataloader.dataset
    graphs = [partner_graph(partner, config) for partner in partners]
    data, _ = proposal(full, arms, graphs, cfg, 0)
    for index, key in ((0, "rec_graph"), (1, "rec2_graph")):
        assert torch.equal(data[key].ndata["x"], graphs[index].ndata["x"]), (
            "MGD must retain observed partner frames; no PROTAC random initialization."
        )
    assert np.array_equal(original, full.GetConformer().GetPositions())
    # Independently invoke the official glue featurizer under the deposited frame.
    _, reference = get_lig_graph_revised(
        deepcopy(full),
        name="X_DDE",
        max_neighbors=config.lig_max_neighbors,
        radius=config.lig_graph_radius,
        ideal_path=None,
        use_random_coords=False,
        seed=0,
        use_rdkit_coords=True,
    )
    for key in ("x", "new_x", "feat", "mu_r_norm"):
        assert torch.allclose(data["lig_graph"].ndata[key], reference.ndata[key], atol=0.00001)
    assert torch.allclose(data["lig_graph"].edata["feat"], reference.edata["feat"])
    assert all(
        torch.equal(a, b) for a, b in zip(data["lig_graph"].edges(), reference.edges(), strict=True)
    )
    random.seed(0)
    torch.manual_seed(0)
    np.random.seed(0)
    with torch.no_grad():
        native = model(**data, mode="predict")[0]
    expected_ligand = correct_ligand(native["ligs_coords_pred"], reference.ndata["x"], full)
    expected_partner = (
        rotate_and_translate(graphs[1].ndata["x"], native["rotation_2"], native["translation_2"])
        .cpu()
        .numpy()
    )
    actual = predict_one(full, arms, graphs, cfg, model, 0, True)
    assert np.allclose(actual["ligand_positions"], expected_ligand, atol=0.02, rtol=0)
    actual_partner = rotate_and_translate(
        graphs[1].ndata["x"], actual["rotation"], actual["translation"]
    )
    assert np.allclose(actual_partner, expected_partner, atol=0.02, rtol=0)
    source_quality = check_candidate(
        full,
        deepcopy(full),
        arms,
        partners,
        {"rotation": np.eye(3), "translation": np.zeros((1, 3))},
    )
    assert not source_quality["bond_violations"]
    assert all(row["contacting_heavy_atoms"] >= 3 for row in source_quality["arms"])
    # Real platform output must still pass chemical identity, proper transforms and
    # the unchanged acceptance gates. Native parity does not assert model accuracy.
    runpy.run_path("/platform/native_entry.py", run_name="__main__")
    Path("/output/native-checks.json").write_text(
        json.dumps(
            {
                "positive_full_graph_checked": True,
                "native_model_executed": True,
                "official_glue_graph_and_forward_parity": True,
                "observed_partner_initialization_preserved": True,
                "no_compulsory_arm_maps": True,
                "source_crystal_geometry": source_quality,
                "scientific_accuracy_accepted": False,
                "scope": "two principal protein chains; accessory proteins and zinc omitted",
            },
            indent=2,
        )
    )


main()
