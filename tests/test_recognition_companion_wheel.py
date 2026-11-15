"""Inspect the real built wheel, without installing or starting the host."""

from pathlib import Path
from zipfile import ZipFile

from opendde_workbench.recognition_companion import ADAPTERS


def test_wheel_contains_exact_canonical_companion_sources_and_manifest():
    root = Path(__file__).resolve().parents[1]
    wheels = list((root / "dist").glob("*.whl"))
    assert len(wheels) == 1
    with ZipFile(wheels[0]) as wheel:
        for name, source in ADAPTERS.items():
            assert wheel.read("opendde_workbench/data/recognition_locale/" + name) == (
                root / source
            ).read_bytes()
        assert wheel.read("opendde_workbench/data/recognition_locale/patch.json") == (
            root / "src/opendde_workbench/data/recognition_locale/patch.json"
        ).read_bytes()
        assert wheel.read("opendde_workbench/recognition_companion.py") == (
            root / "src/opendde_workbench/recognition_companion.py"
        ).read_bytes()
