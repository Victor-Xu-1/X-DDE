"""Reuse only an integrity-checked X-DDE native research model, with its label and domain limits."""

import heapq
import importlib.metadata
import json
import math
import pickle

import numpy as np
from platformnative_io import csv_sink, finish, progress, readonly_database, source_result


def run(request):
    from rdkit import Chem, DataStructs
    from rdkit.Chem import rdFingerprintGenerator

    model_root, trained = source_result(request, 0)
    root, analysis = source_result(request, 1)
    artifact = next(
        (item for item in trained["artifacts"] if item["role"] == "del_enrichment_research_model"),
        None,
    )
    if artifact is None or artifact["size"] > 64 * 1024**2:
        raise ValueError("Choose a bounded, completed X-DDE native enrichment research model.")
    # Uploaded pickle files are never accepted. The exact native producer and all
    # source artifact digests are verified by the platform and source_result above.
    with (model_root / artifact["name"]).open("rb") as stream:
        saved = pickle.load(stream)
    if (
        saved.get("schema_version") != 1
        or saved.get("fingerprint") != "Morgan2_2048"
        or saved.get("target") != "log1p_DEL_enrichment"
        or saved.get("dependency") != importlib.metadata.version("scikit-learn")
    ):
        raise ValueError("Retrain this model with the current reviewed native model contract.")
    options = request["payload"]
    comparison = next(
        (
            item
            for item in analysis["metadata"]["comparisons"]
            if item["id"] == options["chosen_comparison"]
        ),
        None,
    )
    context = saved["training_context"]
    if comparison is None or any(
        comparison[key] != context[key] for key in ("selection", "reference")
    ):
        raise ValueError(
            "The model's experimental selection/reference groups differ from this study."
        )
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    domain = [
        DataStructs.CreateFromBitString("".join(map(str, row)))
        for row in saved["domain_fingerprints"]
    ]
    training_ids = set(saved["training_ids"])
    database = readonly_database(root / "analysis.sqlite")
    candidates, points = [], []
    predicted_count = rejected_count = 0
    attempted = 0
    try:
        with (
            csv_sink(
                "/output/predicted-enrichment.csv",
                [
                    "member",
                    "smiles",
                    "predicted_log1p_enrichment",
                    "tree_prediction_std",
                    "nearest_training_reference_tanimoto",
                    "in_training",
                    "observed_log1p_enrichment",
                ],
            ) as write,
            csv_sink("/output/model-unresolved-members.csv", ["member", "reason"]) as rejected,
        ):
            cursor = database.execute(
                "SELECT m.*,e.score FROM members m JOIN enrichment e ON e.member=m.id "
                "WHERE e.comparison=? ORDER BY m.ordinal",
                (options["chosen_comparison"],),
            )
            for row in cursor:
                attempted += 1
                if attempted > options.get("max_prediction_members", 50000):
                    raise ValueError(
                        "The prediction set exceeds the explicitly selected member budget."
                    )
                molecule = Chem.MolFromSmiles(row["smiles"]) if row["smiles"] else None
                if molecule is None:
                    rejected([row["id"], "chemical_identity_unresolved"])
                    rejected_count += 1
                    continue
                bit = generator.GetFingerprint(molecule)
                if (
                    row["id"] in training_ids
                    and Chem.MolToSmiles(molecule, isomericSmiles=True)
                    != saved["training_chemistry"][row["id"]]
                ):
                    raise ValueError("A reused training member ID identifies different chemistry.")
                feature = generator.GetFingerprintAsNumPy(molecule).reshape(1, -1)
                values = np.asarray(
                    [tree.predict(feature)[0] for tree in saved["model"].estimators_]
                )
                predicted, spread = float(values.mean()), float(values.std(ddof=1))
                similarity = (
                    max(DataStructs.BulkTanimotoSimilarity(bit, domain)) if domain else None
                )
                write(
                    [
                        row["id"],
                        row["smiles"],
                        predicted,
                        spread,
                        similarity,
                        row["id"] in training_ids,
                        math.log1p(row["score"]),
                    ]
                )
                if len(points) < 1000:
                    points.append({"observed": math.log1p(row["score"]), "predicted": predicted})
                candidate = {
                    "id": row["id"],
                    "source_job": request["sources"][1]["job_id"],
                    "source_record": row["ordinal"],
                    "smiles": row["smiles"],
                    "score": predicted,
                    "geometry": "none",
                }
                key = (predicted, -row["ordinal"], candidate)
                if len(candidates) < options["retain"]:
                    heapq.heappush(candidates, key)
                elif key[:2] > candidates[0][:2]:
                    heapq.heapreplace(candidates, key)
                predicted_count += 1
                if attempted % 500 == 0:
                    progress("Applying the source-bound DEL research model", attempted, None)
    finally:
        database.close()
    if not predicted_count:
        raise ValueError("This study has no resolved chemical structures for model reuse.")
    from pathlib import Path

    Path("/output/prediction-scope.json").write_text(
        json.dumps(
            {
                "target": "log1p DEL enrichment; not affinity",
                "comparison": comparison,
                "domain_reference_size": len(domain),
                "domain_reference_scope": "first 2048 training fingerprints",
                "uncertainty": "individual-tree spread; not a calibrated confidence interval",
                "external_validation": "model application; not an independent validation",
                "heldout_predictions": points,
            }
        )
    )
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "model",
        {
            "predicted-enrichment.csv": "research_model_predictions",
            "model-unresolved-members.csv": "unresolved_chemical_members",
            "prediction-scope.json": "research_model_application",
        },
        counts={
            "source_members": attempted,
            "predicted": predicted_count,
            "unresolved_structures": rejected_count,
        },
        candidates=[item[2] for item in sorted(candidates, key=lambda item: (-item[0], -item[1]))],
        metadata={
            "model_action": "predict",
            "prediction_unit": "log1p_enrichment",
            "method": "source-bound RandomForest Morgan baseline",
            "comparison": comparison,
        },
        warnings=[
            "Applied research-model scores are not affinity or externally validated predictions."
        ],
    )
