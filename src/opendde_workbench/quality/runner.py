"""Actual offline PoseBusters profiles; source molecular coordinates are never repaired."""

import hashlib
import json
from copy import deepcopy
from importlib.metadata import version
from pathlib import Path

from manifest import CHECKS, CONFIG_DIGESTS
from native_inputs import bound, molecule, receptor
from normalize import normalize
from options import QualityOptions


def run(request, bindings, directory):
    import posebusters
    from posebusters import PoseBusters

    options = QualityOptions.model_validate(request["options"])
    profile = options.profile
    config_file = Path(posebusters.__file__).parent / "config" / (profile + ".yml")
    raw_config = config_file.read_bytes()
    config_digest = hashlib.sha256(raw_config).hexdigest()
    if config_digest != CONFIG_DIGESTS[profile] or version("posebusters") != "0.6.5":
        raise ValueError(
            "Installed native quality configuration differs from the reviewed version."
        )
    native = PoseBusters(config=profile, max_workers=0)
    config = deepcopy(native.config)
    # Upstream seed42 and50-conformer default stay intact; bound CPU thread use explicitly.
    for module in config["modules"]:
        if module["function"] == "energy_ratio":
            module.setdefault("parameters", {})["num_threads"] = options.cpu
    native = PoseBusters(config=config, max_workers=0)
    _, raw_mol = bound(request["molecule"], bindings, directory, ".sdf")
    predicted = molecule(raw_mol, request["molecule"]["record"])
    protein, reference = None, None
    if request.get("protein"):
        protein, raw_protein = bound(request["protein"], bindings, directory, ".pdb")
        receptor(raw_protein)
    if request.get("reference"):
        _, raw_reference = bound(request["reference"], bindings, directory, ".sdf")
        reference = molecule(raw_reference, request["reference"]["record"])
    table = native.bust(predicted, reference, protein, full_report=True)
    from sdf_io import split_records

    previews = {}
    raw_preview = split_records(raw_mol)[request["molecule"]["record"]] + b"\n$$$$\n"
    Path("/output/molecule-preview.sdf").write_bytes(raw_preview)
    previews["molecule-preview.sdf"] = hashlib.sha256(raw_preview).hexdigest()
    if protein:
        Path("/output/protein-preview.pdb").write_bytes(raw_protein)
        previews["protein-preview.pdb"] = hashlib.sha256(raw_protein).hexdigest()
    return {
        "operation": "pose_quality",
        "complete": True,
        "schema_version": 1,
        "inputs": {
            name: request[name]
            for name in ("molecule", "protein", "reference")
            if request.get(name)
        },
        "options": options.model_dump(mode="json"),
        "coordinate_basis": request.get("coordinate_basis"),
        "versions": {name: version(name) for name in ("posebusters", "rdkit", "numpy", "pandas")},
        "native_config_sha256": config_digest,
        "previews_sha256": previews,
        "scope": "native_pose_plausibility_not_binding_affinity_or_experimental_validation",
        **normalize(table, CHECKS[profile]),
    }


def main():
    directory = Path("/input")
    request = json.loads((directory / "request.json").read_text())
    if request["operation"] != "pose_quality":
        raise ValueError("Unsupported quality operation.")
    result = run(request, json.loads((directory / "bindings.json").read_text()), directory)
    file = Path("/output/result.json.tmp")
    file.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
    file.replace("/output/result.json")


if __name__ == "__main__":
    main()
