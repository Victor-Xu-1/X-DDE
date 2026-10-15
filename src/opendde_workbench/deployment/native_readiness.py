"""Full native CLI startup checks before publishing a managed runtime as installed."""

import os

from ..integrations.cache_environment import torch_cache_arguments


def verify_native_entrypoint(identifier, image, execute):
    """Probe the declared native entry points without loading models or research inputs."""
    if identifier not in {"reinvent", "plip"}:
        return
    args = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "64",
        "--memory",
        "2048m",
        "--cpus",
        "1",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=256m",
        "--env",
        "HOME=/tmp",
        "--env",
        "OMP_NUM_THREADS=1",
        "--env",
        "WANDB_MODE=disabled",
        "--env",
        "HF_HUB_OFFLINE=1",
        "--env",
        "TRANSFORMERS_OFFLINE=1",
        "--env",
        "MPLCONFIGDIR=/tmp/matplotlib",
        "--env",
        "NUMBA_CACHE_DIR=/tmp/numba",
    ]
    args += torch_cache_arguments(identifier)
    entrypoint = (
        ["--entrypoint", "reinvent", image, "--help"]
        if identifier == "reinvent"
        else [
            "--entrypoint",
            "python",
            image,
            "-c",
            "from Bio.PDB import MMCIFParser, PDBIO; "
            "from plip.structure.preparation import PDBComplex",
        ]
    )
    execute([*args, *entrypoint], timeout=120)
