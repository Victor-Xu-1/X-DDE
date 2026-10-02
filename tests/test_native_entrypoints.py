"""Native entries must not shadow third-party dependencies with platform contracts."""

import subprocess
import sys
from pathlib import Path


def test_native_conversion_imports_the_external_requests_library(tmp_path):
    native = Path(__file__).parents[1] / "src/opendde_workbench/native_runtime"
    dependency = tmp_path / "external"
    dependency.mkdir()
    (dependency / "requests.py").write_text("origin = 'scientific-dependency'\n")
    runner = dependency / "runner"
    runner.mkdir()
    (runner / "__init__.py").write_text("")
    (runner / "batch_inference.py").write_text(
        "import requests\nassert requests.origin == 'scientific-dependency'\n"
        "class Command:\n"
        "    def main(self, **kwargs): return []\n"
        "tojson = Command()\n"
    )
    program = (
        "import sys,runpy; from pathlib import Path; "
        f"sys.path[:0] = [{str(native)!r}, {str(dependency)!r}]; "
        f"entry = runpy.run_path({str(native / 'task.py')!r}); "
        "assert entry['conversion']({'assets': [], 'altloc': 'A', 'assembly_id': None, "
        "'include_discont_poly_poly_bonds': False}, {}) == {'documents': []}"
    )
    result = subprocess.run([sys.executable, "-c", program], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
