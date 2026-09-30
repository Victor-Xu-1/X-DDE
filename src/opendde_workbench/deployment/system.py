"""Explicit administrator command for Ubuntu system prerequisites."""

import os
import subprocess
from pathlib import Path


def install_system():
    if os.geteuid() != 0:
        raise RuntimeError(
            "System setup requires administrator rights. Run: sudo $(command -v "
            "opendde) setup system"
        )
    if "ID=ubuntu" not in Path("/etc/os-release").read_text():
        raise RuntimeError(
            "Automatic system setup supports Ubuntu. Install Docker Engine using "
            "your distribution's official instructions."
        )
    env = dict(os.environ, DEBIAN_FRONTEND="noninteractive")
    for args in (
        ["apt-get", "update"],
        ["apt-get", "install", "-y", "docker.io", "python3-venv", "ca-certificates", "git"],
        ["systemctl", "enable", "--now", "docker"],
    ):
        subprocess.run(args, check=True, timeout=900, env=env)
    print(
        "Docker installed. Configure Docker access for your user and NVIDIA "
        "Container Toolkit for GPU jobs using the official setup guides in README."
    )
