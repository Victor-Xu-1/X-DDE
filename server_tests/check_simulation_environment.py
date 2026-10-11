"""CI/server-only installation smoke: imports and real CLI negotiation, no MD task execution."""

import argparse
import json
import subprocess
from pathlib import Path

from opendde_workbench.deployment.locked_packages import conda_archives
from opendde_workbench.deployment.transfers import download, extract
from opendde_workbench.integrations.image import lock_digest, prepare_context
from opendde_workbench.integrations.specs import PROGRAMS, recipe_digest


def interfaces(program):
    if program == "openfe":
        return [
            ["openfe", "--version"],
            [
                "python",
                "-c",
                "import json,pathlib,openfe,openmm,pdbfixer; "
                "from openfe.protocols.openmm_rfe import RelativeHybridTopologyProtocol; "
                "assert openfe.__version__=='1.12.0'; assert openmm.__version__=='8.4.0'; "
                "metadata=[json.loads(p.read_text()) for p in "
                "pathlib.Path('/opt/conda/conda-meta').glob('cuda-version-*.json')]; "
                "assert len(metadata)==1 and metadata[0]['version'].startswith('12.9'); "
                "protocol=RelativeHybridTopologyProtocol.default_settings(); "
                "RelativeHybridTopologyProtocol(protocol); "
                "print(openfe.__version__,openmm.__version__,metadata[0]['version'])",
            ],
        ]
    return [
        ["/opt/gromacs/bin/gmx", "--version"],
        ["/opt/gromacs/bin/gmx", "grompp", "-h"],
        ["/opt/gromacs/bin/gmx", "mdrun", "-h"],
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--program", choices=("gromacs", "openfe"), default="gromacs")
    program = parser.parse_args().program
    evidence = Path("outputs/simulation-environment").resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    spec = PROGRAMS[program]
    source_root = None
    if source := spec.get("source"):
        archive = evidence / "openmmforcefields.zip"
        download(source["url"], archive, source["sha256"], print, lambda: None)
        extract(archive, evidence / "source", lambda: None)
        source_root = evidence / "source" / source["prefix"]
    context = evidence / "image-context"
    archives = None
    if program == "openfe":
        import opendde_workbench.integrations.image as image_recipe

        archives = conda_archives(
            Path(image_recipe.__file__).with_name("recipes") / "openfe.conda.txt",
            evidence / "dependency-archives",
            print,
            lambda: None,
        )
    prepare_context(program, context, source_root, archives=archives)
    tag = "xdde-" + program + "-check:" + recipe_digest(program)[:16]
    with (evidence / "build.log").open("w") as logfile:
        subprocess.run(
            [
                "docker",
                "build",
                *(["--network=none"] if program == "openfe" else []),
                "--tag",
                tag,
                str(context),
            ],
            check=True,
            stdout=logfile,
            stderr=subprocess.STDOUT,
            timeout=2400,
        )
    for index, arguments in enumerate(interfaces(program)):
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
                *(
                    ["--env", "LD_LIBRARY_PATH=/opt/gromacs/lib"]
                    if program == "gromacs" and index < 3
                    else []
                ),
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
        if program == "gromacs" and index == 0 and ("2026.3" not in text or "CUDA" not in text):
            raise ValueError("The native GROMACS build differs from its reviewed CUDA interface.")
    image = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", tag], text=True
    ).strip()
    (evidence / "scope.json").write_text(
        json.dumps(
            {
                "program": program,
                "image": image,
                "recipe_sha256": recipe_digest(program),
                "lock_sha256": lock_digest(program),
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
