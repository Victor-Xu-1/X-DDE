"""Attach and normalize in the existing supervised process group, no second queue."""

import json
import subprocess
import sys
from pathlib import Path


def main():
    directory = Path(sys.argv[1]).resolve()
    container = json.loads((directory / "pocket-execution.json").read_text())["container"]
    import re

    if not re.fullmatch(r"xdde-p2rank-[a-f0-9-]{36}", container):
        raise ValueError("Invalid native container identity.")
    code = subprocess.run(["docker", "start", "--attach", container], check=False).returncode
    if code:
        raise SystemExit(code)
    inspection = subprocess.run(
        ["docker", "inspect", "--format", "{{json .State}}", container],
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    state = json.loads(inspection.stdout)
    if state.get("Running") or state.get("ExitCode") != 0 or state.get("OOMKilled"):
        raise RuntimeError("Native P2Rank prediction did not finish successfully.")
    subprocess.run(
        [sys.executable, str(Path(__file__).with_name("runner.py")), str(directory)], check=True
    )


if __name__ == "__main__":
    main()
