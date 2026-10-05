"""Dispatch only reviewed scientific programs, after checking installed model bytes."""

import importlib
import json
import os
from pathlib import Path


def main():
    request = json.loads(Path("/input/request.json").read_text())
    program = os.environ.get("XDDE_PROGRAM")
    if program != request["payload"]["kind"] or program not in {
        "boltz",
        "reinvent",
        "ligandmpnn",
        "boltzgen",
        "openmm",
        "apbs",
        "chemprop",
        "plip",
    }:
        raise ValueError("Native program identity differs from its typed task.")
    recipes = json.loads(Path("/platform/recipes.json").read_text())["programs"]
    if recipes[program]["models"]:
        root = Path("/models")
        from native_resources import model_files

        model_files(root, recipes[program], full_hash=True)
    importlib.import_module("native_" + program).run(request)


if __name__ == "__main__":
    main()
