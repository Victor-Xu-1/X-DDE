"""Train/reuse native Chemprop models from explicitly labeled SDF research libraries."""

import csv
import math
from importlib.metadata import version
from pathlib import Path

from native_io import copy_artifact, csv_file, execute, finish, input_file, metric


def input_table(request, output):
    from rdkit import Chem

    file, _ = input_file(request, "library")
    supplier = Chem.SDMolSupplier(str(file), removeHs=False)
    if not 1 <= len(supplier) <= 500:
        raise ValueError("Choose an SDF research library containing 1–500 original records.")
    training = request["operation"] == "chemprop_train"
    prop = request["payload"]["activity_property"]
    rows, molecules = [], []
    for record, molecule in enumerate(supplier):
        if molecule is None or len(Chem.GetMolFrags(molecule)) != 1:
            raise ValueError(
                f"Original record {record + 1} is invalid or disconnected. Prepare it first."
            )
        smiles = Chem.MolToSmiles(molecule, isomericSmiles=True)
        row = [smiles]
        if training:
            if not molecule.HasProp(prop):
                raise ValueError(
                    f"Original record {record + 1} is missing the selected activity field."
                )
            activity = float(molecule.GetProp(prop))
            if not math.isfinite(activity):
                raise ValueError("Training labels must be finite experimental/reference values.")
            row.append(activity)
        rows.append(row)
        molecules.append(molecule)
    if training and (len(rows) < 50 or len({row[0] for row in rows}) < 50):
        raise ValueError("Scaffold-split training requires at least 50 distinct labeled molecules.")
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["smiles", "activity"] if training else ["smiles"])
        writer.writerows(rows)
    return rows, molecules


def run(request):
    from rdkit import Chem

    raw = Path("/output/native")
    raw.mkdir()
    source = raw / "research-data.csv"
    rows, molecules = input_table(request, source)
    options, payload = request["options"], request["payload"]
    execution = [
        "--accelerator",
        "gpu" if options["device"] == "cuda" else "cpu",
        "--devices",
        "1",
        "--num-workers",
        "0",
    ]
    if payload["mode"] == "train":
        execute(
            [
                "chemprop",
                "train",
                "--data-path",
                source,
                "--task-type",
                "regression",
                "--smiles-columns",
                "smiles",
                "--target-columns",
                "activity",
                "--split",
                "SCAFFOLD_BALANCED",
                "--split-sizes",
                "0.8",
                "0.1",
                "0.1",
                "--data-seed",
                options["seed"],
                "--pytorch-seed",
                options["seed"],
                "--epochs",
                payload["epochs"],
                "--save-dir",
                raw / "training",
                "--save-data-splits",
                *execution,
            ]
        )
        checkpoints = sorted((raw / "training").rglob("best.pt"))
        if len(checkpoints) != 1:
            raise ValueError("Chemprop did not produce one unique trained checkpoint.")
        model = copy_artifact(checkpoints[0], "property-model.pt")
        tests = list((raw / "training").rglob("test.csv"))
        trains = list((raw / "training").rglob("train.csv"))
        if len(tests) != 1 or len(trains) != 1:
            raise ValueError("Chemprop did not export one auditable scaffold split.")
        predictions = raw / "best-model-test.csv"
        execute(
            [
                "chemprop",
                "predict",
                "--test-path",
                tests[0],
                "--smiles-columns",
                "smiles",
                "--model-paths",
                checkpoints[0],
                "--preds-path",
                predictions,
                *execution,
            ]
        )
        from native_validation import regression_evidence

        metrics, points = regression_evidence(
            tests[0], trains[0], predictions, payload["activity_unit"]
        )
        csv_file("training-data.csv", ["SMILES", payload["activity_property"]], rows)
        finish(
            request,
            version("chemprop"),
            metrics=metrics,
            model_artifact=model,
            validation_points=points,
        )
        return
    predictions = raw / "predictions.csv"
    execute(
        [
            "chemprop",
            "predict",
            "--test-path",
            source,
            "--smiles-columns",
            "smiles",
            "--model-paths",
            "/input/property-model.pt",
            "--preds-path",
            predictions,
            *execution,
        ]
    )
    with predictions.open(encoding="utf-8-sig", newline="") as stream:
        predicted = list(csv.DictReader(stream))
    if len(predicted) != len(rows):
        raise ValueError("Property predictions differ from the original selected library records.")
    candidates = []
    for record, (row, molecule) in enumerate(zip(predicted, molecules, strict=True)):
        value = row.get("activity")
        if value is None:
            raise ValueError(
                "The trained model returned no value for its original activity target."
            )
        if row.get("smiles") != rows[record][0]:
            raise ValueError("Native property predictions changed molecular row correspondence.")
        score = metric(
            payload["activity_property"],
            value,
            payload["activity_unit"],
            "User-trained Chemprop regression",
        )
        name = f"source-record-{record + 1:03d}.sdf"
        with Chem.SDWriter(str(Path("/output", name))) as writer:
            writer.write(molecule)
        candidates.append(
            {
                "id": f"molecule-{record + 1:03d}",
                "artifact": name,
                "smiles": rows[record][0],
                "metrics": [score],
                "geometry": "none",
            }
        )
    csv_file(
        "property-predictions.csv",
        ["Original record", "SMILES", payload["activity_property"], "Unit"],
        [
            [index + 1, row["smiles"], row["metrics"][0]["value"], payload["activity_unit"]]
            for index, row in enumerate(candidates)
        ],
    )
    finish(request, version("chemprop"), candidates)
