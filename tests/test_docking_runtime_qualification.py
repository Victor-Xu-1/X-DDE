"""Regressions from the real STAT6 study: explicit alternates and lazy CUDA libraries."""

import hashlib

import pytest

from opendde_workbench.assets import AssetStore
from opendde_workbench.docking.contract import DockingTask
from opendde_workbench.docking.receptor_input import require_explicit_alternates
from opendde_workbench.docking.snapshot import capture
from opendde_workbench.store import Store

ATOM = b"ATOM      1  CA  ALA A   1       1.000   2.000   3.000  1.00 20.00           C  \n"


def test_alternate_receptor_is_rejected_before_binding_but_original_bytes_are_preserved(tmp_path):
    store = Store(tmp_path / "jobs.sqlite3")
    assets = AssetStore(store, tmp_path / "assets")
    raw = ATOM[:16] + b"A" + ATOM[17:]
    protein = assets.save("alternate.pdb", "structure", raw)
    ligand = assets.save("molecule.sdf", "ligand", b"mol\n$$$$\n")
    receptor = {"asset_id": protein.id, "sha256": protein.sha256}
    request = DockingTask.model_validate(
        {
            "operation": "docking",
            "name": "Controlled binding metadata",
            "receptor": receptor,
            "ligand": {"asset_id": ligand.id, "sha256": ligand.sha256},
            "search": {
                "kind": "box",
                "frame": receptor,
                "box": {"center": [0, 0, 0], "size": [20, 20, 20]},
            },
        }
    )
    with pytest.raises(ValueError, match="Structure preparation"):
        assets.validate_bindings(request)
    assert assets.path(protein).read_bytes() == raw
    assert protein.sha256 == hashlib.sha256(raw).hexdigest()
    assert store.list_jobs() == []
    require_explicit_alternates(ATOM)


def test_native_task_snapshot_retains_the_same_alternate_guard(tmp_path):
    from pathlib import Path

    import opendde_workbench.docking.snapshot as snapshot

    adapter, hashes = capture(tmp_path / "job", Path(snapshot.__file__).parent)
    stereo = adapter / "docking/molfile_stereo.py"
    assert hashlib.sha256(stereo.read_bytes()).hexdigest() == hashes["docking/molfile_stereo.py"]
    assert (
        stereo.read_bytes()
        == (Path(snapshot.__file__).parent.parent / "chemistry/molfile_stereo.py").read_bytes()
    )
    file = adapter / "docking/receptor_input.py"
    assert hashlib.sha256(file.read_bytes()).hexdigest() == hashes["docking/receptor_input.py"]
    namespace = {}
    exec(compile(file.read_text(), str(file), "exec"), namespace)
    with pytest.raises(ValueError, match="alternate atom"):
        namespace["require_explicit_alternates"](ATOM[:16] + b"B" + ATOM[17:])
    namespace["require_explicit_alternates"](ATOM)
