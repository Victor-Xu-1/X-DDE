"""Compile typed components to the official Boltz-2 CLI and retain its native metrics."""

import json
from importlib.metadata import version
from pathlib import Path

from native_boltz_inputs import protein_msa
from native_io import copy_artifact, csv_file, execute, finish, metric, source_molecule


def run(request):
    import yaml
    from rdkit import Chem

    payload = request["payload"]
    raw = Path("/output/native")
    raw.mkdir()
    sequences = []
    for component in payload["components"]:
        body = {"id": component["id"]}
        if component["kind"] == "ligand":
            molecule = (
                source_molecule(request)
                if component.get("source")
                else Chem.MolFromSmiles(component["value"])
            )
            if molecule is None or len(Chem.GetMolFrags(molecule)) != 1:
                raise ValueError("Choose one valid connected small-molecule structure.")
            body["smiles"] = Chem.MolToSmiles(molecule, isomericSmiles=True)
        else:
            body["sequence"] = component["value"]
            if component["kind"] == "protein":
                body["msa"] = protein_msa(request, component, raw / "msas")
        sequences.append({component["kind"]: body})
    specification = {"version": 1, "sequences": sequences}
    if payload["affinity"]:
        binder = next(c["id"] for c in payload["components"] if c["kind"] == "ligand")
        specification["properties"] = [{"affinity": {"binder": binder}}]
    source = raw / "prediction.yaml"
    source.write_text(yaml.safe_dump(specification, sort_keys=False))
    options = request["options"]
    execute(
        [
            "boltz",
            "predict",
            source,
            "--model",
            "boltz2",
            "--cache",
            "/models",
            "--out_dir",
            raw,
            "--accelerator",
            "gpu",
            "--devices",
            "1",
            # The managed recipe provides native PyTorch operators, not optional cuEquivariance.
            "--no_kernels",
            "--diffusion_samples",
            payload["samples"],
            "--recycling_steps",
            payload["recycling_steps"],
            "--sampling_steps",
            payload["sampling_steps"],
            "--seed",
            options["seed"],
            "--num_workers",
            "0",
            "--output_format",
            "mmcif",
            "--write_full_pae",
            "--write_full_pde",
        ]
    )
    predicted = sorted(raw.rglob("prediction_model_*.cif"))
    if len(predicted) != payload["samples"]:
        raise ValueError("Boltz did not produce the requested number of native structures.")
    candidates, confidence_samples = [], []
    processed = raw / "boltz_results_prediction/processed/structures/prediction.npz"
    if processed.is_file():
        copy_artifact(processed, "boltz-processed-structure.npz")
    for index, file in enumerate(predicted):
        report = file.with_name("confidence_" + file.stem + ".json")
        if not report.is_file():
            raise ValueError("Boltz native confidence report is missing.")
        confidence = json.loads(report.read_text())
        metrics = [
            metric(key, confidence[key], "0–1", "Boltz-2 native confidence", "confidence")
            for key in ("confidence_score", "ptm", "iptm", "complex_plddt")
            if key in confidence
        ]
        name = copy_artifact(file, f"structure-{index + 1:03d}.cif")
        copy_artifact(report, f"{Path(name).stem}-confidence.json")
        sample = {
            "candidate_id": Path(name).stem,
            "native_rank": int(file.stem.rsplit("_", 1)[1]),
            "structure_artifact": name,
        }
        # Preserve the writer's exact ranked sidecars, not a reconstructed matrix.
        for field in ("pae", "pde", "plddt"):
            source = file.with_name(f"{field}_{file.stem}.npz")
            if source.is_file():
                sample[field + "_artifact"] = copy_artifact(
                    source, f"{Path(name).stem}-{field}.npz"
                )
        confidence_samples.append(sample)
        candidates.append(
            {
                "id": f"structure-{index + 1:03d}",
                "artifact": name,
                "metrics": metrics,
                "geometry": "predicted_structure",
            }
        )
    affinity_metrics = []
    if payload["affinity"]:
        reports = list(raw.rglob("affinity_prediction.json"))
        if len(reports) != 1:
            raise ValueError("Boltz native affinity report is missing or ambiguous.")
        affinity = json.loads(reports[0].read_text())
        for key, unit in (
            ("affinity_probability_binary", "probability"),
            ("affinity_pred_value", "log10(IC50 / µM)"),
        ):
            if key not in affinity:
                raise ValueError("Boltz affinity output lacks its native result field.")
            affinity_metrics.append(
                metric(key, affinity[key], unit, "Boltz-2 native affinity prediction")
            )
    csv_file(
        "structures.csv",
        ["Structure", "Metric", "Value", "Unit"],
        [[c["id"], m["name"], m["value"], m["unit"]] for c in candidates for m in c["metrics"]],
    )
    finish(
        request,
        version("boltz"),
        candidates,
        affinity_metrics,
        boltz={
            "protocol": "boltz-2.2.1-cif-row-v1",
            "writer_version": version("boltz"),
            "mapping_artifact": "boltz-processed-structure.npz" if processed.is_file() else None,
            "samples": confidence_samples,
        },
    )
