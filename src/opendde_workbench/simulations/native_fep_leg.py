"""Execute each native thermodynamic leg in a fresh process with its own GPU contexts."""

import json
import subprocess
import sys
from pathlib import Path


def execute_leg(plan, work, native_result, timeout):
    if type(timeout) is not int or not 1 <= timeout <= 604800:
        raise ValueError("FEP leg must retain the remaining task deadline.")
    summary = work / "leg-summary.json"
    subprocess.run(
        [
            sys.executable,
            "-B",
            str(Path(__file__).resolve()),
            str(plan),
            str(work),
            str(native_result),
            str(summary),
        ],
        check=True,
        timeout=timeout,
    )
    return json.loads(summary.read_text())


def main():
    import openfe
    from gufe.protocols.protocoldag import execute_DAG
    from native_fep_result import summarize

    if openfe.__version__ != "1.12.0":
        raise ValueError("Install the reviewed OpenFE 1.12.0 environment.")
    plan, work, native_result, summary = map(Path, sys.argv[1:])
    transformation = openfe.Transformation.from_json(plan)
    result = execute_DAG(
        transformation.create(),
        shared_basedir=work,
        scratch_basedir=work,
        keep_shared=True,
        raise_error=True,
        n_retries=0,
    )
    if not result.ok():
        raise ValueError("A native FEP leg failed; no binding free energy is reported.")
    gathered = transformation.protocol.gather([result])
    gathered.to_json(native_result)
    summary.write_text(json.dumps(summarize(gathered), allow_nan=False))


if __name__ == "__main__":
    main()
