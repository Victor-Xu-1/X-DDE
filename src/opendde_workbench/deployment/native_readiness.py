"""Full native CLI startup checks before publishing a managed runtime as installed."""

import os

from ..integrations.cache_environment import torch_cache_arguments
from .native_probe import run_probe


def verify_native_entrypoint(identifier, image, execute, directory):
    """Probe the declared native entry points without loading models or research inputs."""
    if identifier not in {"reinvent", "plip", "ligandmpnn"}:
        return
    args = [
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
    if identifier == "reinvent":
        entrypoint = ["--entrypoint", "reinvent", image, "--help"]
    elif identifier == "ligandmpnn":
        entrypoint = ["--entrypoint", "python", image, "/opt/native/run.py", "--help"]
    else:
        entrypoint = [
            "--entrypoint",
            "python",
            image,
            "-c",
            "from Bio.PDB import MMCIFParser, PDBIO; "
            "from plip.structure.preparation import PDBComplex",
        ]
    run_probe(identifier, image, [*args, *entrypoint], execute, directory)
