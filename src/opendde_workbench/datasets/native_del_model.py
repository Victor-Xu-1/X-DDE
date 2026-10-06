"""A molecular enrichment baseline with an explicit held-out cycle, never an affinity model."""

import importlib.metadata
import json
import math
import pickle
import random
from pathlib import Path

import numpy as np
from platformnative_io import finish, readonly_database, source_result, write_csv


def run(request):
    if request["payload"].get("model_action", "train") == "predict":
        from native_del_predict import run as predict

        return predict(request)
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator
    from scipy.stats import spearmanr
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    from sklearn.model_selection import GroupShuffleSplit

    root, original = source_result(request)
    database = readonly_database(root / "analysis.sqlite")
    options, seed = request["payload"], request["options"]["seed"]
    members = []
    rejected = total = 0
    randomizer = random.Random(seed)
    try:
        for row in database.execute(
            "SELECT m.*,e.score FROM members m JOIN enrichment e ON e.member=m.id "
            "WHERE e.comparison=? ORDER BY m.ordinal",
            (options["chosen_comparison"],),
        ):
            total += 1
            if len(members) < options["max_training_members"]:
                members.append(dict(row))
            elif (replacement := randomizer.randrange(total)) < len(members):
                members[replacement] = dict(row)
    finally:
        database.close()
    generator = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)
    libraries = {}
    if len(request["sources"]) > 1:
        from del_definition import prepare_home

        definition_root, _ = source_result(request, 1)
        libraries = prepare_home(json.loads((definition_root / "del-definition.json").read_text()))
    features, labels, group_ids, identities, chemistry = [], [], [], [], []
    for row in members:
        cycles = json.loads(row["cycles"])
        if options["holdout_cycle"] >= len(cycles):
            raise ValueError(
                "Choose an explicitly observed building-block cycle for independent holdout."
            )
        smiles = row["smiles"]
        if not smiles and libraries:
            library = libraries.get(row["library"] or options["library"])
            if library is not None:
                try:
                    smiles = library.enumerate_by_bb_ids(cycles).smi
                except (ValueError, RuntimeError, KeyError):
                    rejected += 1
                    continue
        molecule = Chem.MolFromSmiles(smiles) if smiles else None
        if molecule is None:
            rejected += 1
            continue
        features.append(generator.GetFingerprintAsNumPy(molecule))
        labels.append(math.log1p(row["score"]))
        group_ids.append(cycles[options["holdout_cycle"]])
        identities.append(row["id"])
        chemistry.append(Chem.MolToSmiles(molecule, isomericSmiles=True))
    if len(features) < 100 or len(set(group_ids)) < 8 or len(set(labels)) < 10:
        raise ValueError(
            "Need 100 resolved structures, eight cycle holdout groups and varying enrichments."
        )
    features, labels = np.asarray(features), np.asarray(labels)
    split = GroupShuffleSplit(n_splits=1, test_size=options["holdout_fraction"], random_state=seed)
    train, test = next(split.split(features, labels, group_ids))
    if len(train) < 50 or len(test) < 20:
        raise ValueError(
            "The grouped holdout contains too few independent training or evaluation members."
        )
    training_groups = {group_ids[index] for index in train}
    testing_groups = {group_ids[index] for index in test}
    if training_groups & testing_groups:
        raise ValueError("A holdout building block leaked into model training.")
    model = RandomForestRegressor(
        n_estimators=options["trees"],
        max_depth=20,
        min_samples_leaf=3,
        n_jobs=request["options"]["cpu"],
        random_state=seed,
    )
    model.fit(features[train], labels[train])
    predictions = model.predict(features[test])
    baseline = np.full_like(predictions, labels[train].mean())
    correlation = spearmanr(labels[test], predictions).statistic
    metrics = {
        "rmse_log1p_enrichment": float(mean_squared_error(labels[test], predictions) ** 0.5),
        "mae_log1p_enrichment": float(mean_absolute_error(labels[test], predictions)),
        "mean_baseline_rmse": float(mean_squared_error(labels[test], baseline) ** 0.5),
    }
    if math.isfinite(correlation):
        metrics["spearman_enrichment"] = float(correlation)
    write_csv(
        "/output/holdout-predictions.csv",
        ["member", "heldout_cycle", "observed_log1p_enrichment", "predicted_log1p_enrichment"],
        [
            (identities[index], group_ids[index], float(labels[index]), float(prediction))
            for index, prediction in zip(test, predictions, strict=True)
        ],
    )
    Path("/output/model-evaluation.json").write_text(
        json.dumps(
            {
                "metrics": metrics,
                "training_members": len(train),
                "heldout_members": len(test),
                "training_groups": sorted(training_groups),
                "heldout_groups": sorted(testing_groups),
                "holdout_cycle": options["holdout_cycle"],
                "seed": seed,
                "heldout_predictions": [
                    {"observed": float(labels[index]), "predicted": float(prediction)}
                    for index, prediction in list(zip(test, predictions, strict=True))[:1000]
                ],
                "target": "DEL log1p enrichment; not affinity",
                "validation": "one_cycle_group_holdout_only",
                "fingerprint": "Morgan radius2 2048bit",
                "source": request["sources"][0],
            }
        )
    )
    with Path("/output/enrichment-baseline.pkl").open("wb") as file:
        pickle.dump(
            {
                "model": model,
                "target": "log1p_DEL_enrichment",
                "fingerprint": "Morgan2_2048",
                "source": request["sources"][0],
                "training_context": next(
                    item
                    for item in original["metadata"]["comparisons"]
                    if item["id"] == options["chosen_comparison"]
                ),
                "training_ids": [identities[index] for index in train],
                "training_chemistry": {identities[index]: chemistry[index] for index in train},
                "domain_fingerprints": features[train[:2048]].astype(np.uint8),
                "dependency": importlib.metadata.version("scikit-learn"),
                "schema_version": 1,
            },
            file,
            protocol=5,
        )
    finish(
        request,
        importlib.metadata.version("deli-chem"),
        "model",
        {
            "enrichment-baseline.pkl": "del_enrichment_research_model",
            "model-evaluation.json": "independent_holdout_evaluation",
            "holdout-predictions.csv": "heldout_member_predictions",
        },
        counts={
            "source_members": total,
            "sampled_members": len(members),
            "training": len(train),
            "heldout": len(test),
            "unresolved_structures": rejected,
        },
        metrics=metrics,
        metadata={
            "method": "RandomForest Morgan baseline",
            "scope": "research_baseline; not scientifically accepted affinity prediction",
            "holdout_cycle": options["holdout_cycle"],
            "model_action": "train",
        },
        warnings=["The baseline did not improve on the training mean in the independent holdout."]
        if metrics["rmse_log1p_enrichment"] >= metrics["mean_baseline_rmse"]
        else [],
    )
