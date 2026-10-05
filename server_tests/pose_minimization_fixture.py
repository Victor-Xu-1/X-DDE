"""Public BRD4/JQ1 materials with the existing catalogue's exact CC0 byte identities."""

import hashlib
import json
import os
from pathlib import Path


def public_material(key):
    source = json.loads(Path("src/opendde_workbench/examples/catalogue.json").read_text())["files"][
        key
    ]
    # Live model exports can change formatting. Use the immutable, SHA-verified public bundle.
    root = Path(os.environ["WB_MIN_REFERENCE_STATE"]) / "assets"
    matches = [
        file
        for file in root.glob("*")
        if file.is_file()
        and not file.is_symlink()
        and file.stat().st_size == source["bytes"]
        and hashlib.sha256(file.read_bytes()).hexdigest() == source["sha256"]
    ]
    assert len(matches) == 1, f"The pinned {key} source must exist in the verified public bundle."
    raw = matches[0].read_bytes()
    assert len(raw) == source["bytes"]
    assert hashlib.sha256(raw).hexdigest() == source["sha256"]
    return raw, source


def receptor_chain_a(raw):
    # Preserve the experimental coordinates while selecting only protein chain A.
    rows = [
        row
        for row in raw.splitlines()
        if row.startswith(b"ATOM  ") and row[21:22] == b"A" and row[16:17] in {b" ", b"A"}
    ]
    assert len(rows) > 500
    return b"\n".join(rows) + b"\nTER\nEND\n"
