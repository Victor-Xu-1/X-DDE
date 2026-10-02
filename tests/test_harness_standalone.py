"""The native interpreter has no installed X-DDE package or task metadata namespace."""

import os
import subprocess
import sys
from pathlib import Path

from opendde_workbench import harness_tools


def test_native_contracts_import_as_standalone_modules(tmp_path):
    directory = Path(harness_tools.__file__).parent
    code = (
        "import sys; sys.path.insert(0,sys.argv[1]); "
        "from harness_tools import TOOLS,LOCAL_MODELS,validate_payload; "
        "validate_payload({'sequences':['EVQLVESGGGLVQPGGSLRLSCAAS']}); "
        "assert TOOLS['esm'][0]=='EsmScoreRequest'; "
        "assert set(LOCAL_MODELS)=={'rmsd','compare'}; "
        "assert 'opendde_workbench.task_metadata' not in sys.modules"
    )
    env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    subprocess.run(
        [sys.executable, "-I", "-c", code, str(directory)], cwd=tmp_path, env=env, check=True
    )
