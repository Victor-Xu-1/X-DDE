"""Native Mol-1 sample identity, confidence scales, originals and complete outputs."""

import json
import math
from pathlib import Path

from native_io import copy_artifact, csv_file, finish, metric
from native_mol1_confidence import compact_confidence

SCORES = {
    "ranking_score": ("Model ranking score", "native", -100, 1),
    "plddt": ("pLDDT", "0–100", 0, 100),
    "ptm": ("pTM", "0–1", 0, 1),
    "iptm": ("ipTM", "0–1", 0, 1),
    "gpde": ("Global predicted distance error", "angstrom", 0, 100000),
}


def collect_results(request, identifier, root):
    payload = request["payload"]
    candidates, rows = [], []
    seeds = [request["options"]["seed"], *payload["additional_seeds"]]
    for seed in seeds:
        directory = root / identifier / ("seed_" + str(seed)) / "predictions"
        for rank in range(payload["samples"]):
            key = f"seed-{seed}-rank-{rank}"
            structure = directory / f"{identifier}_sample_{rank}.cif"
            summary = directory / f"{identifier}_summary_confidence_sample_{rank}.json"
            if (
                not structure.is_file()
                or not summary.is_file()
                or summary.stat().st_size > 8 * 1024**2
            ):
                raise ValueError(
                    "Mol-1 did not return every requested native sample and confidence file."
                )
            confidence = json.loads(summary.read_text())
            metrics = []
            for field, (label, unit, low, high) in SCORES.items():
                value = confidence.get(field)
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(value)
                    or not low <= value <= high
                ):
                    raise ValueError("Mol-1 returned an invalid native confidence field: " + field)
                metrics.append(metric(label, value, unit, "Mol-1 native prediction", "confidence"))
            full = directory / f"{identifier}_full_data_sample_{rank}.json"
            full_name = None
            preview_name = None
            if payload["atom_confidence"]:
                if not full.is_file():
                    raise ValueError("Requested Mol-1 atom/token confidence data is missing.")
                full_name = copy_artifact(full, key + "-full-data.json")
                preview_name = key + "-confidence-preview.json"
                compact_confidence(full, Path("/output") / preview_name)
            artifact = copy_artifact(structure, key + ".cif")
            summary_name = copy_artifact(summary, key + "-confidence.json")
            candidates.append(
                {
                    "id": key,
                    "artifact": artifact,
                    "metrics": metrics,
                    "geometry": "predicted_structure",
                }
            )
            rows.append(
                {
                    "candidate_id": key,
                    "seed": seed,
                    "rank": rank,
                    "summary_artifact": summary_name,
                    "full_data_artifact": full_name,
                    "preview_artifact": preview_name,
                }
            )
        if len(list(directory.glob(identifier + "_sample_*.cif"))) != payload["samples"]:
            raise ValueError("Mol-1 produced an unexpected number of native structures.")
    csv_file(
        "structures.csv",
        ["Structure", "Metric", "Value", "Unit"],
        [
            [candidate["id"], value["name"], value["value"], value["unit"]]
            for candidate in candidates
            for value in candidate["metrics"]
        ],
    )
    recipes = json.loads(Path("/platform/recipes.json").read_text())["programs"]
    finish(
        request,
        recipes["mol1"]["version"],
        candidates=candidates,
        mol1={
            "model": "mol-1-base",
            "samples": rows,
            "confidence_axes": "token_indices_not_residue_numbers",
            "scope": "model_confidence_not_experimental_binding",
        },
    )
