"""Verify bundled model bytes before trusted upstream checkpoint loading."""

import hashlib
from importlib.metadata import version

from manifest import ENDPOINTS, METADATA, VERSIONS


def verify_models():
    from admet_ai.constants import DEFAULT_ADMET_PATH, DEFAULT_MODELS_DIR

    if {name: version(name) for name in VERSIONS} != VERSIONS:
        raise ValueError("ADMET dependencies differ from the reviewed model runtime.")
    if (
        hashlib.sha256(DEFAULT_ADMET_PATH.read_bytes()).hexdigest()
        != METADATA["endpoint_csv_sha256"]
    ):
        raise ValueError("The native endpoint definitions differ from the reviewed version.")
    root = DEFAULT_MODELS_DIR.resolve()
    files = {str(file.relative_to(root)): file for file in root.glob("**/*.pt")}
    if set(files) != set(METADATA["weights"]):
        raise ValueError("The native model ensemble has unexpected or missing files.")
    for name, expected in METADATA["weights"].items():
        file = files[name]
        if file.is_symlink() or file.stat().st_size != expected["size"]:
            raise ValueError("A bundled ADMET model has changed.")
        raw = file.read_bytes()
        blob = b"blob " + str(len(raw)).encode() + b"\0" + raw
        if hashlib.sha1(blob).hexdigest() != expected["git_blob_sha1"]:
            raise ValueError("A bundled ADMET checkpoint differs from the frozen upstream source.")
    return root


def predict(smiles, cpu, root):
    import torch
    from admet_ai import ADMETModel

    torch.set_num_threads(cpu)
    torch.set_num_interop_threads(1)
    model = ADMETModel(models_dir=root, include_physchem=False, drugbank_path=None, num_workers=0)
    if (
        model.device != "cpu"
        or model.num_ensembles != 2
        or [len(group) for group in model.model_lists] != [5, 5]
        or model.drugbank is not None
        or model.include_physchem
    ):
        raise ValueError("The native ADMET model configuration differs from the reviewed recipe.")
    table = model.predict(smiles)
    if (
        list(table.index) != smiles
        or len(table) != len(smiles)
        or len(table.columns) != len(ENDPOINTS)
        or set(table.columns) != set(ENDPOINTS)
    ):
        raise ValueError("ADMET predictions changed record identities or native endpoint coverage.")
    return {smile: {name: float(table.loc[smile, name]) for name in ENDPOINTS} for smile in smiles}
