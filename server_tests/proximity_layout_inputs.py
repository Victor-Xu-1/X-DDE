"""Seed only verified public coordinate inputs for isolated page-layout checks."""

import argparse
import hashlib
import os
import zipfile
from pathlib import Path

from opendde_workbench.deployment.transfers import download
from opendde_workbench.examples.catalogue import FILES
from opendde_workbench.integrations.specs import PROGRAMS


def seed(state):
    if os.environ.get("CI") != "true":
        raise RuntimeError("Public layout-fixture preparation belongs in isolated CI.")
    cache = state / "public-example-cache"
    cache.mkdir(parents=True, exist_ok=True)
    resource = PROGRAMS["deepternary"]["models"][0]
    archive = state / "public-ternary-source.zip"
    download(
        resource["url"], archive, resource["sha256"], print, lambda: None, limit=resource["size"]
    )
    with zipfile.ZipFile(archive) as bundle:
        for key, member in (
            ("ternary_vhl", "protein1.pdb"),
            ("ternary_brd4", "protein2.pdb"),
            ("ternary_mz1", "ligand.sdf"),
        ):
            spec = FILES[key]
            data = bundle.read("output/protac22/5T35_H_E_759/" + member)
            if len(data) != spec.bytes or hashlib.sha256(data).hexdigest() != spec.sha256:
                raise ValueError("The source-attributed coordinate fixture changed.")
            (cache / spec.sha256).write_bytes(data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    seed(parser.parse_args().state.resolve())
