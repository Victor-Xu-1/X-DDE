"""CI/server-only installation smoke: imports and real CLI negotiation, no MD task execution."""

import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path

from opendde_workbench.deployment.transfers import extract
from opendde_workbench.integrations.image import lock_digest, prepare_context
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest


def main():
    evidence = Path("outputs/simulation-environment").resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    spec = PROGRAMS["gromacs"]
    source = spec["source"]
    archive = evidence / "openmmforcefields.zip"
    with urllib.request.urlopen(source["url"], timeout=60) as stream:
        content = stream.read(16 * 1024**2 + 1)
    if len(content) > 16 * 1024**2 or hashlib.sha256(content).hexdigest() != source["sha256"]:
        raise ValueError("The reviewed parameterization source changed.")
    archive.write_bytes(content)
    extract(archive, evidence / "source", lambda: None)
    context = evidence / "image-context"
    prepare_context("gromacs", context, evidence / "source" / source["prefix"])
    tag = "xdde-gromacs-check:" + recipe_digest("gromacs")[:16]
    with (evidence / "build.log").open("w") as logfile:
        subprocess.run(
            ["docker", "build", "--tag", tag, str(context)],
            check=True,
            stdout=logfile,
            stderr=subprocess.STDOUT,
            timeout=2400,
        )
    commands = [
        ["gmx", "--version"],
        ["gmx", "grompp", "-h"],
        ["gmx", "mdrun", "-h"],
        [
            "python",
            "-c",
            "import openmm,parmed,mdtraj,pdbfixer,openmmforcefields; "
            "from openff.toolkit import Molecule; "
            "print(openmm.__version__,parmed.__version__,mdtraj.__version__); "
            "assert openmm.__version__=='8.6.1'; assert parmed.__version__=='4.3.1'; "
            "assert mdtraj.__version__=='1.11.0'",
        ],
    ]
    for index, arguments in enumerate(commands):
        result = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--network",
                "none",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,size=256m",
                "--env",
                "HOME=/tmp",
                "--env",
                "USER=xdde",
                "--env",
                "LOGNAME=xdde",
                "--entrypoint",
                arguments[0],
                tag,
                *arguments[1:],
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        text = result.stdout + result.stderr
        (evidence / f"interface-{index}.txt").write_text(text, encoding="utf-8")
        if index == 0 and ("2026.3" not in text or "CUDA" not in text):
            raise ValueError("The native GROMACS build differs from its reviewed CUDA interface.")
    image = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", tag], text=True
    ).strip()
    (evidence / "scope.json").write_text(
        json.dumps(
            {
                "program": "gromacs",
                "image": image,
                "recipe_sha256": recipe_digest("gromacs"),
                "lock_sha256": lock_digest("gromacs"),
                "scientific_calculations": False,
                "gpu_execution": False,
                "scientific_acceptance": "pending_target_server",
                "verified": ["locked image build", "native CLI/version", "native Python bindings"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
