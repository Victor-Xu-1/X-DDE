"""Installer-only Docker build networking; scientific tasks remain offline."""

import os
from collections.abc import Mapping, Sequence


def build_command(args: Sequence[str], env: Mapping[str, str]) -> list[str]:
    command = list(args)
    build_index = 3 if len(command) >= 4 and command[1] == "--host" else 1
    if (
        len(command) <= build_index
        or os.path.basename(command[0]) != "docker"
        or command[build_index] != "build"
    ):
        return command
    network = env.get("WB_INSTALL_BUILD_NETWORK", "default")
    if network not in {"default", "host"}:
        raise ValueError("WB_INSTALL_BUILD_NETWORK must be default or host.")
    options = []
    if network == "host" and not any(
        arg == "--network" or arg.startswith("--network=") for arg in command[build_index + 1 :]
    ):
        options.extend(["--network", "host"])
    # Docker's predefined proxy arguments are excluded from image history/cache.
    # Pass names only: credentials never appear in this process's command arguments.
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"):
        if env.get(name):
            options.extend(["--build-arg", name])
    return [*command[: build_index + 1], *options, *command[build_index + 1 :]]
