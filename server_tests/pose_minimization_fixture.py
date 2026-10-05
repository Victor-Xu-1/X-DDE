"""Public BRD4/JQ1 materials with the existing catalogue's exact CC0 byte identities."""

import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


def public_material(key):
    source = json.loads(Path("src/opendde_workbench/examples/catalogue.json").read_text())["files"][
        key
    ]
    with urlopen(source["url"], timeout=30) as response:
        raw = response.read(source["bytes"] + 1)
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
