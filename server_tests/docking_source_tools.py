"""Load the actual isolated docking modules for bounded chemistry boundary checks."""

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/opendde_workbench"
REFERENCE = "NC(=O)c1cnc(Nc2ccc(N3CCC(O)C3)cc2)nc1NCc1ccccc1"


def load_tools(monkeypatch):
    for folder in ("datasets", "chemistry", "docking"):
        monkeypatch.syspath_prepend(str(ROOT / folder))

    def load(name, file):
        spec = importlib.util.spec_from_file_location(name, ROOT / file)
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, name, module)
        spec.loader.exec_module(module)
        return module

    load("platformnative_io", "datasets/native_io.py")
    library = load("library_records", "datasets/library_records.py")
    chemistry = load("docking_export", "docking/chemistry.py")
    return library.unbound_conformer, chemistry
