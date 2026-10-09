"""CI-only Linux solver; write an explicit SHA256 lock without installing on the owner."""

import argparse
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--program", choices=("openfe", "gromacs"), default="openfe")
program = parser.parse_args().program
root = Path(__file__).resolve().parents[1]
spec = json.loads((root / "src/opendde_workbench/integrations/recipes.json").read_text())[
    "programs"
][program]
process = subprocess.run(
    [
        "docker",
        "run",
        "--rm",
        "--env",
        "CONDA_OVERRIDE_CUDA=12.9",
        "--entrypoint",
        "micromamba",
        spec["base"],
        "create",
        "--dry-run",
        "--json",
        "--platform",
        "linux-64",
        "--channel",
        "conda-forge",
        "--strict-channel-priority",
        "--prefix",
        "/tmp/xdde-" + program + "-resolve",
        *spec["conda"],
    ],
    check=True,
    capture_output=True,
    text=True,
    timeout=1200,
)
plan = json.loads(process.stdout)
packages = plan["actions"]["LINK"]
lines = ["@EXPLICIT"]
for package in sorted(packages, key=lambda p: p["name"]):
    url, digest = package["url"], package["sha256"]
    if not url.startswith("https://conda.anaconda.org/conda-forge/") or len(digest) != 64:
        raise ValueError("Native dependency is missing a trusted channel or SHA256 identity.")
    lines.append(url + "#" + digest)
destination = root / "src/opendde_workbench/integrations/recipes" / (program + ".conda.txt")
destination.write_text("\n".join(lines) + "\n")
print(f"Resolved {len(packages)} immutable Linux packages for {program} {spec['version']}")
