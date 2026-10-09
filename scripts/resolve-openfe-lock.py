"""CI-only Linux solver; pin independent scientific process environments by SHA256."""

import argparse
import json
import re
import subprocess
from pathlib import Path


def resolve(base, requirements, name, cuda=False):
    arguments = ["docker", "run", "--rm"]
    if cuda:
        arguments += ["--env", "CONDA_OVERRIDE_CUDA=12.9"]
    process = subprocess.run(
        [
            *arguments,
            "--entrypoint",
            "micromamba",
            base,
            "create",
            "--dry-run",
            "--json",
            "--platform",
            "linux-64",
            "--channel",
            "conda-forge",
            "--strict-channel-priority",
            "--prefix",
            "/tmp/xdde-" + name + "-resolve",
            *requirements,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=1200,
    )
    if process.returncode:
        print(process.stdout[-12000:])
        print(process.stderr[-12000:])
        raise SystemExit("The scientific environment solver failed; no lock was accepted.")
    packages = json.loads(process.stdout)["actions"]["LINK"]
    lines = ["@EXPLICIT"]
    for package in sorted(packages, key=lambda p: p["name"]):
        url, digest = package["url"], package["sha256"]
        if not url.startswith("https://conda.anaconda.org/conda-forge/") or not re.fullmatch(
            r"[a-f0-9]{64}", digest
        ):
            raise ValueError("Native dependency lacks a trusted channel or SHA256 identity.")
        lines.append(url + "#" + digest)
    print(f"Resolved {len(packages)} immutable Linux packages for {name}")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program", choices=("openfe", "gromacs"), default="openfe")
    program = parser.parse_args().program
    root = Path(__file__).resolve().parents[1]
    recipes = root / "src/opendde_workbench/integrations"
    spec = json.loads((recipes / "recipes.json").read_text(encoding="utf-8"))["programs"][program]
    plans = {program: resolve(spec["base"], spec["conda"], program)}
    if spec.get("execution_conda"):
        plans[program + "-engine"] = resolve(
            spec["base"], spec["execution_conda"], program + "-engine", cuda=True
        )
    for name, plan in plans.items():
        (recipes / "recipes" / (name + ".conda.txt")).write_text(plan, encoding="utf-8")


if __name__ == "__main__":
    main()
