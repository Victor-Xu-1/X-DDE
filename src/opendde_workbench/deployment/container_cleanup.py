"""Retire only the ephemeral container labeled for this deployment operation."""

import subprocess


def cleanup_install_container(name, operation):
    inspected = subprocess.run(
        [
            "docker",
            "inspect",
            "--format",
            '{{ index .Config.Labels "org.xdde.install.operation" }}',
            name,
        ],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if inspected.returncode:
        return  # --rm already removed a completed container.
    if inspected.stdout.strip() != operation:
        raise RuntimeError("Installation container ownership changed; refuse to stop it.")
    subprocess.run(["docker", "rm", "--force", name], capture_output=True, timeout=30, check=True)
