"""CI-only Linux solver; write an explicit SHA256 lock without installing on the owner."""

import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = json.loads((root / "src/opendde_workbench/integrations/recipes.json").read_text())[
    "programs"
]["openfe"]
process = subprocess.run(
    [
        "docker",
        "run",
        "--rm",
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
        "/tmp/xdde-openfe-resolve",
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
destination = root / "src/opendde_workbench/integrations/recipes/openfe.conda.txt"
destination.write_text("\n".join(lines) + "\n")
print(f"Resolved {len(packages)} immutable Linux packages for OpenFE {spec['version']}")
