"""Compile a bounded binder specification to the published BoltzGen native pipeline."""

import csv
from importlib.metadata import version
from pathlib import Path

from native_io import copy_artifact, csv_file, execute, finish, input_file, metric


def run(request):
    import yaml

    source, _ = input_file(request, "structure")
    payload = request["payload"]
    raw = Path("/output/native")
    raw.mkdir()
    reserved = set(payload["target_chains"])
    chain = next((c for c in "ZYXWVUTSRQPONMLKJIHGFEDCBA" if c not in reserved), None)
    if chain is None:
        raise ValueError("No unique designed-chain identifier is available.")
    spec = {
        "entities": [
            {
                "protein": {
                    "id": chain,
                    "sequence": f"{payload['length'][0]}..{payload['length'][1]}",
                }
            },
            {
                "file": {
                    "path": str(source),
                    "include": [{"chain": {"id": c}} for c in payload["target_chains"]],
                }
            },
        ]
    }
    if payload["modality"] in {"antibody", "nanobody"}:
        from native_scaffold import scaffold_entity

        spec["entities"][0] = scaffold_entity(request, raw, reserved)
    file = raw / "design.yaml"
    file.write_text(yaml.safe_dump(spec, sort_keys=False), encoding="utf-8")
    protocol = {
        "protein": "protein-anything",
        "peptide": "peptide-anything",
        "antibody": "antibody-anything",
        "nanobody": "nanobody-anything",
    }[payload["modality"]]
    execute(
        [
            "boltzgen",
            "run",
            file,
            "--output",
            raw / "designs",
            "--protocol",
            protocol,
            "--num_designs",
            payload["candidates"],
            "--budget",
            payload["retain"],
            "--cache",
            "/models",
            "--design_checkpoints",
            "/models/boltzgen1_diverse.ckpt",
            "/models/boltzgen1_adherence.ckpt",
            "--inverse_fold_checkpoint",
            "/models/boltzgen1_ifold.ckpt",
            "--folding_checkpoint",
            "/models/boltz2_conf_final.ckpt",
            "--affinity_checkpoint",
            "/models/boltz2_aff.ckpt",
            "--moldir",
            "/models/mols",
        ]
    )
    selected = raw / "designs/final_ranked_designs"
    structures = sorted((selected / f"final_{payload['retain']}_designs").glob("*.cif"))
    if not structures or len(structures) > payload["retain"]:
        raise ValueError("BoltzGen produced no bounded final ranked structural set.")
    scores = {}
    reports = [selected / f"final_designs_metrics_{payload['retain']}.csv"]
    for report in reports:
        with report.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                name = row.get("file_name")
                if name:
                    scores[name] = row
    candidates = []
    for index, file in enumerate(structures, 1):
        original = file.name.split("_", 1)[-1]
        row = scores.get(original)
        if row is None:
            raise ValueError("A final binder has no corresponding native metrics row.")
        metrics = []
        for key in ("iptm", "ptm", "design_rmsd", "refolding_rmsd", "absolute_score"):
            if row.get(key):
                metrics.append(
                    metric(
                        key,
                        row[key],
                        "Å" if "rmsd" in key else "native score",
                        "BoltzGen native analysis",
                    )
                )
        name = copy_artifact(file, f"binder-{index:03d}.cif")
        candidates.append(
            {
                "id": f"binder-{index:03d}",
                "artifact": name,
                "metrics": metrics,
                "geometry": "predicted_structure",
            }
        )
    for index, file in enumerate(selected.glob("*.fasta"), 1):
        copy_artifact(file, f"binder-sequences-{index}.fasta")
    csv_file(
        "binders.csv",
        ["Candidate", "Metric", "Value", "Unit"],
        [
            [row["id"], m["name"], m["value"], m["unit"]]
            for row in candidates
            for m in row["metrics"]
        ],
    )
    finish(request, version("boltzgen"), candidates)
