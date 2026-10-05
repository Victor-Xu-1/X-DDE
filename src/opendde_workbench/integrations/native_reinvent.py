"""Native REINVENT4 sampling and bounded property optimization, without synthesis planning."""

import csv
import json
from pathlib import Path

from native_io import csv_file, execute, finish, metric, molecular_candidate, source_molecule

MODELS = {
    "de_novo": "reinvent.prior",
    "analogues": "mol2mol_similarity.prior",
    "r_groups": "libinvent.prior",
    "linker": "linkinvent.prior",
    "optimize": "mol2mol_similarity.prior",
}


def endpoint(name, low, high):
    return {
        "name": name,
        "weight": 1,
        "transform": {
            "type": "double_sigmoid",
            "low": low,
            "high": high,
            "coef_div": max(high, 1),
            "coef_si": 20,
            "coef_se": 20,
        },
    }


def configuration(request, raw):
    from rdkit import Chem

    payload, options = request["payload"], request["options"]
    mode = payload["mode"]
    model = Path("/models") / MODELS[mode]
    if not model.is_file():
        raise ValueError("Install the selected official REINVENT prior before submission.")
    parameters = {
        "model_file": str(model),
        "output_file": str(raw / "sampling.csv"),
        "num_smiles": payload["candidates"],
        "unique_molecules": True,
        "randomize_smiles": True,
    }
    if mode != "de_novo":
        if mode in {"analogues", "optimize"}:
            smiles = Chem.MolToSmiles(source_molecule(request), isomericSmiles=True)
        else:
            fragments = payload["fragments"]
            if any(Chem.MolFromSmiles(value) is None for value in fragments):
                raise ValueError("The selected attachment-point structure cannot be parsed.")
            smiles = "|".join(fragments)
        seeds = raw / "starting-molecules.smi"
        seeds.write_text(smiles + "\n")
        parameters["smiles_file"] = str(seeds)
    spec = {
        "run_type": "sampling",
        "device": "cuda:0" if options["device"] == "cuda" else "cpu",
        "parameters": parameters,
    }
    if mode == "optimize":
        spec.update(
            run_type="staged_learning",
            parameters={
                "prior_file": str(model),
                "agent_file": str(model),
                "smiles_file": parameters["smiles_file"],
                "summary_csv_prefix": str(raw / "optimization"),
                "use_checkpoint": False,
                "purge_memories": False,
                "batch_size": min(payload["candidates"], 64),
                "randomize_smiles": True,
                "unique_sequences": True,
            },
            learning_strategy={"type": "dap", "sigma": 128, "rate": 0.0001},
            stage=[
                {
                    "chkpt_file": str(raw / "optimized.chkpt"),
                    "termination": "simple",
                    "max_score": 1.0,
                    "min_steps": payload["optimization_steps"],
                    "max_steps": payload["optimization_steps"],
                    "scoring": {
                        "type": "geometric_mean",
                        "component": [
                            {"QED": {"endpoint": [{"name": "QED", "weight": 1}]}},
                            {
                                "MolecularWeight": {
                                    "endpoint": [
                                        endpoint("Molecular weight", *payload["molecular_weight"])
                                    ]
                                }
                            },
                            {"SlogP": {"endpoint": [endpoint("LogP", *payload["logp"])]}},
                        ],
                    },
                }
            ],
        )
    return spec


def run(request):
    from rdkit import Chem
    from rdkit.Chem import QED, Crippen, Descriptors

    raw = Path("/output/native")
    raw.mkdir()
    config = raw / "design.json"
    config.write_text(json.dumps(configuration(request, raw)))
    execute(["reinvent", "--seed", request["options"]["seed"], "-l", raw / "native.log", config])
    files = (
        sorted(raw.glob("optimization*.csv"))
        if request["payload"]["mode"] == "optimize"
        else [raw / "sampling.csv"]
    )
    if not files or any(not file.is_file() for file in files):
        raise ValueError("REINVENT produced no native molecular table.")
    unique = {}
    for file in files:
        with file.open(encoding="utf-8-sig", newline="") as stream:
            for index, row in enumerate(csv.DictReader(stream)):
                if index >= 20000:
                    raise ValueError("Native molecular output exceeds the bounded review budget.")
                smiles = row.get("SMILES") or row.get("Smiles") or row.get("smiles")
                molecule = Chem.MolFromSmiles(smiles) if smiles else None
                if molecule is None or len(Chem.GetMolFrags(molecule)) != 1:
                    continue
                canonical = Chem.MolToSmiles(molecule, isomericSmiles=True)
                unique[canonical] = row
    if not unique:
        raise ValueError("REINVENT produced no valid connected molecular candidates.")
    candidates = []
    for smiles, row in list(unique.items())[: request["payload"]["candidates"]]:
        molecule = Chem.MolFromSmiles(smiles)
        metrics = [
            metric("QED", QED.qed(molecule), "0–1", "RDKit QED", "descriptor"),
            metric(
                "Molecular weight",
                Descriptors.MolWt(molecule),
                "g/mol",
                "RDKit molecular weight",
                "descriptor",
            ),
            metric("LogP", Crippen.MolLogP(molecule), "logP", "RDKit Crippen", "descriptor"),
        ]
        native_score = row.get("NLL") or row.get("nll")
        if native_score:
            metrics.append(metric("NLL", native_score, "nats", "REINVENT native likelihood"))
        candidates.append(
            molecular_candidate(smiles, len(candidates) + 1, request["options"]["seed"], metrics)
        )
    csv_file(
        "molecules.csv",
        ["Candidate", "SMILES", "QED", "MW", "LogP"],
        [
            [row["id"], row["smiles"], *[m["value"] for m in row["metrics"][:3]]]
            for row in candidates
        ],
    )
    finish(request, "4.8", candidates)
