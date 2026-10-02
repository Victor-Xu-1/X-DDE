"""Run the pinned native archive installer in the managed scientific image."""

import os
import shutil
from pathlib import Path

from .container_cleanup import cleanup_install_container


def install_search(root, work, installed, execute, report, checkpoint):
    from ..resources import resource_inventory

    model_root = root / "models" / "opendde"
    if shutil.disk_usage(root).free < 110 * 1024**3:
        raise ValueError("Search databases require at least 110 GiB free installation space.")
    model_root.mkdir(parents=True, exist_ok=True)
    code = Path(installed["runtime"]["code"])
    tools = Path(installed["opendde-tools"]["directory"])
    checkpoint()
    report("Installing four template/RNA databases; existing files are retained")
    container = "xdde-install-" + work.name
    args = [
        "docker",
        "run",
        "--rm",
        "--name",
        container,
        "--label",
        "org.xdde.install.operation=" + work.name,
        "--network",
        "host",
        "--user",
        f"{os.getuid()}:{os.getgid()}",
        "--mount",
        f"type=bind,source={model_root},target=/opendde",
        "--mount",
        f"type=bind,source={code},target=/runtime,readonly",
        "--mount",
        f"type=bind,source={tools},target=/native-tools,readonly",
        "--env",
        "PATH=/native-tools/bin:/opt/runtime/bin:/usr/local/bin:/usr/bin:/bin",
        "--entrypoint",
        "bash",
    ]
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"):
        if os.environ.get(key):
            args += ["--env", key]
    try:
        execute(
            [
                *args,
                installed["compute"]["image"],
                "/runtime/external/opendde/scripts/download_opendde_data.sh",
                "--root",
                "/opendde",
                "--skip-model",
                "--skip-common",
            ],
            timeout=43200,
        )
    finally:
        cleanup_install_container(container, work.name)
    inventory = resource_inventory(model_root)
    if not inventory["templates"] or not inventory["rna"]:
        raise ValueError("The native download did not produce all required search databases.")
    files = {
        path.name: path.stat().st_size for path in (model_root / "search_database").glob("*.fasta")
    }
    return {
        "directory": str(model_root / "search_database"),
        "files": files,
        "source": "OpenDDE native download helper / AlphaFold database archives",
        "verification": "native_archive_decompression_and_file_presence",
    }
