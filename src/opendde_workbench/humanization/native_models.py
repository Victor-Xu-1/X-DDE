"""Only fixed local safetensors models and the fixed packaged OAS reference are used."""

import hashlib
from importlib.metadata import version
from pathlib import Path

from manifest import METADATA, VERSIONS
from proposals import AMINO_ACIDS, validate_scores

MODEL_ROOT = Path("/opt/xdde-sapiens/models")


def verify_file(file, identity):
    if file.is_symlink() or file.stat().st_size != identity["size"]:
        raise ValueError("A fixed humanization resource has changed.")
    data = file.read_bytes()
    actual = (
        hashlib.sha256(data).hexdigest()
        if "sha256" in identity
        else hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    )
    if actual != identity.get("sha256", identity.get("git_blob_sha1")):
        raise ValueError("Humanization resource digest differs from the reviewed upstream.")


def verify_resources():
    if {name: version(name) for name in VERSIONS} != VERSIONS:
        raise ValueError("Humanization dependencies differ from the frozen runtime.")
    for key, group in METADATA["resources"].items():
        directory = MODEL_ROOT / key
        if directory.is_symlink() or {file.name for file in directory.iterdir()} != set(
            group["files"]
        ):
            raise ValueError("Local Sapiens model resources have an unexpected layout.")
        for name, identity in group["files"].items():
            verify_file(directory / name, identity)
    from promb.db import HUMAN_OASIS_DB_PATH

    verify_file(Path(HUMAN_OASIS_DB_PATH), METADATA["oas"])


def scores(sequence, chain):
    import sapiens

    table = sapiens.predict_scores(
        sequence,
        chain,
        checkpoint_path=str(MODEL_ROOT / ("vh" if chain == "H" else "vl")),
        tokenizer_path=str(MODEL_ROOT / "tokenizer"),
    )
    if list(table.index) != list(range(len(sequence))) or tuple(table.columns) != AMINO_ACIDS:
        raise ValueError("Sapiens changed original residue positions or amino-acid identities.")
    rows = [
        {name: float(table.loc[index, name]) for name in AMINO_ACIDS}
        for index in range(len(sequence))
    ]
    validate_scores(rows, sequence)
    return rows
