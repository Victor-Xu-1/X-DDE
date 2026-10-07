"""Finite model proposals and exact native rigid transforms; no distance atom assignment."""

import random
import signal
import time

import numpy as np
import torch
from deepternary.models.correct import correct_ligand
from deepternary.models.rotate_utils import kabsch, rotate_and_translate
from native_proximity_chemistry import ConformerUnavailable
from native_proximity_graphs import load_model, partner_graph, proposal


class BudgetExpired(TimeoutError):
    pass


def expired(*_):
    raise BudgetExpired("The declared ternary wall-time budget was exhausted.")


def predict_one(full, arms, graphs, cfg, model, seed, correction):
    random.seed(seed)
    data, molecule = proposal(full, arms, graphs, cfg, seed)
    with torch.no_grad():
        predicted = model(**data, mode="predict")[0]
    ligand = predicted["ligs_coords_pred"]
    if correction:
        # The original MGD correction reference is the observed ligand geometry;
        # PROTAC uses the initialized conformer. They are different native protocols.
        reference = data["lig_graph"].ndata["new_x" if arms else "x"]
        ligand = torch.from_numpy(correct_ligand(ligand, reference, molecule)).float()
    second = rotate_and_translate(
        data["rec2_coords_input"][0],
        predicted["rotation_2"],
        predicted["translation_2"],
    )
    original = graphs[1].ndata["x"]
    rotation, translation, _ = kabsch(original, second)
    restored = rotate_and_translate(original, rotation, translation)
    matrix = rotation.detach().cpu().numpy()
    offset = translation.detach().cpu().numpy()
    if (
        not np.isfinite(matrix).all()
        or not np.isfinite(offset).all()
        or not np.allclose(matrix.T @ matrix, np.eye(3), atol=0.0001, rtol=0)
        or abs(np.linalg.det(matrix) - 1) > 0.0001
        or not torch.allclose(restored, second, atol=0.01, rtol=0)
    ):
        raise ValueError("Native partner prediction is not one valid proper rigid transform.")
    score = predicted.get("p2_rmsd_pred")
    value = float(score.item()) if score is not None else None
    if value is not None and not np.isfinite(value):
        raise ValueError("Native model ranking value is not finite.")
    positions = ligand.detach().cpu().numpy()
    if positions.shape != (full.GetNumAtoms(), 3) or not np.isfinite(positions).all():
        raise ValueError("Native ligand prediction changed or invalidated its exact coordinates.")
    return {
        "seed": seed,
        "ligand_positions": positions,
        "rotation": matrix,
        "translation": offset,
        "ranking_surrogate": value,
    }


def predictions(request, full, arms, partners):
    payload = request["payload"]
    torch.set_num_threads(request["options"]["cpu"])
    started = time.monotonic()
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, payload["wall_seconds"])
    attempted, returned, failures = 0, [], []
    status = "attempt_budget"
    try:
        cfg, model = load_model(payload["mechanism"] == "molecular_glue")
        graphs = [partner_graph(partner, cfg.test_dataloader.dataset) for partner in partners]
        for attempt in range(payload["attempt_budget"]):
            attempted += 1
            seed = (request["options"]["seed"] + attempt) % 2147483647
            try:
                value = predict_one(
                    full, arms, graphs, cfg, model, seed, payload["ligand_correction"]
                )
                returned.append(value)
            except ConformerUnavailable as error:
                failures.append({"seed": seed, "reason": str(error)[:300]})
            if len(returned) == payload["samples"]:
                status = "requested_samples"
                break
    except BudgetExpired:
        status = "time_budget"
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    return returned, {
        "attempted": attempted,
        "requested": payload["samples"],
        "attempt_budget": payload["attempt_budget"],
        "returned": len(returned),
        "status": status,
        "seconds": time.monotonic() - started,
        "failures": failures,
    }
